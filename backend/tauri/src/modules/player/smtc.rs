use crate::modules::library::SongMetadata;
use crate::utils::paths::{is_app_relative_path, resolve_app_path};
use std::path::PathBuf;
use tauri::AppHandle;
use windows::Media::MediaPlaybackType;
use windows::Media::Playback::MediaPlaybackItem;
use windows::Storage::Streams::{
    DataWriter, InMemoryRandomAccessStream, RandomAccessStreamReference,
};
use windows::core::HSTRING;

/// 将元数据直接绑定到 MediaPlaybackItem
/// 这样 MediaPlayer 播放此 Item 时，会自动显示这些信息
pub fn apply_metadata(
    item: &MediaPlaybackItem,
    meta: &SongMetadata,
    app_handle: Option<&AppHandle>,
) -> windows::core::Result<()> {
    // 1. 获取该媒体项的显示属性
    let props = item.GetDisplayProperties()?;

    // 2. 设置类型为音乐
    props.SetType(MediaPlaybackType::Music)?;

    // 3. 设置文字信息
    let music_props = props.MusicProperties()?;
    music_props.SetTitle(&HSTRING::from(&meta.title))?;
    music_props.SetArtist(&HSTRING::from(&meta.artist))?;
    music_props.SetAlbumTitle(&HSTRING::from(&meta.album))?;

    // 4. 设置封面
    let mut thumbnail_set = false;

    // 尝试文件路径
    if let Some(path) = &meta.cover_path {
        let resolved: Option<PathBuf> = if is_app_relative_path(path) {
            app_handle.and_then(|handle| resolve_app_path(handle, path))
        } else {
            Some(PathBuf::from(path))
        };

        if let Some(full_path) = resolved {
            if let Ok(bytes) = std::fs::read(full_path) {
                if let Some(stream_ref) = bytes_to_stream_ref(&bytes) {
                    props.SetThumbnail(&stream_ref)?;
                    thumbnail_set = true;
                }
            }
        }
    }

    if !thumbnail_set {
        props.SetThumbnail(None)?;
    }

    // 5. 应用修改
    item.ApplyDisplayProperties(&props)?;

    Ok(())
}

/// 将字节数组转为 Windows RandomAccessStreamReference
fn bytes_to_stream_ref(bytes: &[u8]) -> Option<RandomAccessStreamReference> {
    // 1. 写入内存流
    let stream = InMemoryRandomAccessStream::new().ok()?;
    let writer = DataWriter::CreateDataWriter(&stream.GetOutputStreamAt(0).ok()?).ok()?;

    writer.WriteBytes(bytes).ok()?;
    writer.StoreAsync().ok()?;
    writer.FlushAsync().ok()?;
    writer.DetachStream().ok()?;

    // 2. 创建引用
    stream.Seek(0).ok()?;
    RandomAccessStreamReference::CreateFromStream(&stream).ok()
}
