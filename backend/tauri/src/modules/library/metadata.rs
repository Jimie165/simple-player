use base64::prelude::*;
use lofty::prelude::*;
use lofty::read_from_path;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SongMetadata {
    pub id: Option<i64>,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u64,
    pub cover: Option<String>,
    pub path: Option<String>,
    pub size: Option<u64>,
    pub sample_rate: Option<u32>,
    pub bitrate: Option<u32>,
}

impl SongMetadata {
    /// 从数据库 Song 模型转换为 SongMetadata
    pub fn from_db_song(song: &crate::modules::database::Song) -> Self {
        SongMetadata {
            id: Some(song.id),
            title: song.title.clone(),
            artist: song.artist.clone(),
            album: song.album.clone(),
            duration: song.duration as u64,
            cover: song.cover.clone(),
            path: Some(song.path.clone()),
            size: None,
            sample_rate: None,
            bitrate: None,
        }
    }
}

pub fn get_metadata(path: &str) -> Result<SongMetadata, String> {
    let path_obj = Path::new(path);

    // 0. 获取文件大小
    let size = std::fs::metadata(path_obj).map(|m| m.len()).ok();

    // 1. 使用 lofty 读取文件标签
    let tagged_file =
        read_from_path(path_obj).map_err(|e| format!("Failed to read metadata: {}", e))?;

    // 2. 获取标签信息
    let tag = tagged_file.primary_tag();

    let title = tag
        .as_ref()
        .and_then(|t| t.title().map(|s| s.to_string()))
        .unwrap_or_else(|| "Unknown Title".to_string());

    let artist = tag
        .as_ref()
        .and_then(|t| t.artist().map(|s| s.to_string()))
        .unwrap_or_else(|| "Unknown Artist".to_string());

    let album = tag
        .as_ref()
        .and_then(|t| t.album().map(|s| s.to_string()))
        .unwrap_or_else(|| "Unknown Album".to_string());

    // 3. 获取音频属性
    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs();
    let sample_rate = properties.sample_rate();
    let bitrate = properties.audio_bitrate();

    // 4. 获取封面图片
    let mut cover_base64 = None;
    if let Some(t) = tag {
        if let Some(picture) = t.pictures().first() {
            let b64 = BASE64_STANDARD.encode(picture.data());
            let mime_type = picture
                .mime_type()
                .map(|m| m.as_str())
                .unwrap_or("image/jpeg");
            cover_base64 = Some(format!("data:{};base64,{}", mime_type, b64));
        }
    }

    Ok(SongMetadata {
        id: None,
        title,
        artist,
        album,
        duration,
        cover: cover_base64,
        path: Some(path_obj.display().to_string().replace('\\', "/")),
        size,
        sample_rate,
        bitrate,
    })
}
