use base64::prelude::*;
use lofty::prelude::*;
use lofty::read_from_path;
use serde::{Deserialize, Serialize}; // 添加 Deserialize
use std::path::Path;

// 添加 Clone, Deserialize, 并把字段改为 pub
#[derive(Serialize, Deserialize, Clone)]
pub struct SongMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u64,
    pub cover: Option<String>,
    pub path: Option<String>,
}

pub fn get_metadata(path: &str) -> Result<SongMetadata, String> {
    let path = Path::new(path);

    // 1. 使用 lofty 读取文件标签
    let tagged_file =
        read_from_path(path).map_err(|e| format!("Failed to read metadata: {}", e))?;

    // 2. 获取标签信息 (ID3 等)
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

    // 3. 获取音频属性 (时长)
    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs();

    // 4. 获取封面图片 (如果有)
    let mut cover_base64 = None;
    if let Some(t) = tag {
        if let Some(picture) = t.pictures().first() {
            // 将图片二进制数据转为 Base64
            let b64 = BASE64_STANDARD.encode(picture.data());
            // 拼接 Data URI Scheme，方便前端 img 标签直接显示
            let mime_type = picture
                .mime_type()
                .map(|m| m.as_str())
                .unwrap_or("image/jpeg");
            cover_base64 = Some(format!("data:{};base64,{}", mime_type, b64));
        }
    }

    Ok(SongMetadata {
        title,
        artist,
        album,
        duration,
        cover: cover_base64,
        path: Some(path.display().to_string().replace('\\', "/")),
    })
}
