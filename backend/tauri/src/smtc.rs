use crate::metadata::SongMetadata;
use base64::Engine;
use windows::Media::MediaPlaybackType;
use windows::Media::Playback::MediaPlaybackItem;
use windows::Storage::Streams::{
    DataWriter, InMemoryRandomAccessStream, RandomAccessStreamReference,
};
use windows::core::HSTRING;

/// 将元数据直接绑定到 MediaPlaybackItem
/// 这样 MediaPlayer 播放此 Item 时，会自动显示这些信息，且不会被覆盖
pub fn apply_metadata(item: &MediaPlaybackItem, meta: &SongMetadata) -> windows::core::Result<()> {
    // 1. 获取该媒体项的显示属性 (DisplayProperties)
    let props = item.GetDisplayProperties()?;

    // 2. 设置类型为音乐
    props.SetType(MediaPlaybackType::Music)?;

    // 3. 设置文字信息
    let music_props = props.MusicProperties()?;
    music_props.SetTitle(&HSTRING::from(&meta.title))?;
    music_props.SetArtist(&HSTRING::from(&meta.artist))?;
    music_props.SetAlbumTitle(&HSTRING::from(&meta.album))?;

    // 4. 设置封面
    if let Some(cover_base64) = &meta.cover {
        if let Some(stream_ref) = base64_to_stream_ref(cover_base64) {
            props.SetThumbnail(&stream_ref)?;
        }
    } else {
        // 如果没有封面，设置为空
        props.SetThumbnail(None)?;
    }

    // 5. 重要：必须调用 ApplyDisplayProperties 将修改应用回 Item
    item.ApplyDisplayProperties(&props)?;

    Ok(())
}

/// 辅助：将 Data URI (Base64) 转为 Windows RandomAccessStreamReference
fn base64_to_stream_ref(data_uri: &str) -> Option<RandomAccessStreamReference> {
    // 1. 去掉前缀
    let parts: Vec<&str> = data_uri.split(',').collect();
    let base64_data = if parts.len() == 2 { parts[1] } else { data_uri };

    // 2. 解码
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .ok()?;

    // 3. 写入内存流
    let stream = InMemoryRandomAccessStream::new().ok()?;
    let writer = DataWriter::CreateDataWriter(&stream.GetOutputStreamAt(0).ok()?).ok()?;

    writer.WriteBytes(&bytes).ok()?;
    writer.StoreAsync().ok()?;
    writer.FlushAsync().ok()?;
    writer.DetachStream().ok()?;

    // 4. 创建引用
    stream.Seek(0).ok()?;
    RandomAccessStreamReference::CreateFromStream(&stream).ok()
}
