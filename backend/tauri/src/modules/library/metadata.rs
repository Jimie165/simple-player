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
    pub cover: Option<String>,      // base64 data URL (兼容旧版)
    pub cover_path: Option<String>, // 封面文件路径
    pub path: Option<String>,
    pub size: Option<u64>,
    pub sample_rate: Option<u32>,
    pub bitrate: Option<u32>,
    // 扩展元数据
    pub album_artist: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub track_number: Option<i32>,
    pub track_total: Option<i32>,
    pub disc_number: Option<i32>,
    pub disc_total: Option<i32>,
    // 用户数据
    pub play_count: Option<i32>,
    pub last_played_at: Option<String>,
    pub is_favorite: Option<bool>,
    pub rating: Option<i32>,
    pub unique_id: Option<i64>, // Playlist Entry ID
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
            cover_path: song.cover_path.clone(),
            path: Some(song.path.clone()),
            size: None,
            sample_rate: None,
            bitrate: None,
            album_artist: song.album_artist.clone(),
            year: song.year,
            genre: song.genre.clone(),
            track_number: song.track_number,
            track_total: song.track_total,
            disc_number: song.disc_number,
            disc_total: song.disc_total,
            play_count: Some(song.play_count),
            last_played_at: song.last_played_at.clone(),
            is_favorite: Some(song.is_favorite),
            rating: song.rating,
            unique_id: song.unique_id,
        }
    }
}

// 引用 covers 模块
// 注意：需要在文件头部确保能引用到 crate::modules::library::covers
// 由于是在同一个 mod 下，使用 super::covers 或者 crate::modules::library::covers

/// 从文件读取完整元数据
pub fn get_metadata(path: &str, app_data_dir: Option<&Path>) -> Result<SongMetadata, String> {
    let path_obj = Path::new(path);

    // 获取文件大小
    let size = std::fs::metadata(path_obj).map(|m| m.len()).ok();

    // 使用 lofty 读取文件标签
    let tagged_file =
        read_from_path(path_obj).map_err(|e| format!("Failed to read metadata: {}", e))?;

    // 获取标签信息
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

    // 扩展元数据
    let album_artist = tag.as_ref().and_then(|t| {
        // 尝试获取 album artist，如果没有则使用 artist
        t.get_string(&lofty::tag::ItemKey::AlbumArtist)
            .map(|s| s.to_string())
    });

    let year = tag.as_ref().and_then(|t| t.year()).map(|y| y as i32);

    let genre = tag
        .as_ref()
        .and_then(|t| t.genre().map(|s| s.to_string()));

    let track_number = tag
        .as_ref()
        .and_then(|t| t.track())
        .map(|n| n as i32);

    let track_total = tag
        .as_ref()
        .and_then(|t| t.track_total())
        .map(|n| n as i32);

    let disc_number = tag
        .as_ref()
        .and_then(|t| t.disk())
        .map(|n| n as i32);

    let disc_total = tag
        .as_ref()
        .and_then(|t| t.disk_total())
        .map(|n| n as i32);

    // 获取音频属性
    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs();
    let sample_rate = properties.sample_rate();
    let bitrate = properties.audio_bitrate();

    // 获取封面图片
    let mut cover_base64 = None;
    let mut resolved_cover_path = None;
    
    if let Some(t) = tag {
        if let Some(picture) = t.pictures().first() {
            let b64 = BASE64_STANDARD.encode(picture.data());
            let mime_type = picture
                .mime_type()
                .map(|m| m.as_str())
                .unwrap_or("image/jpeg");
            let data_url = format!("data:{};base64,{}", mime_type, b64);
            
            if let Some(dir) = app_data_dir {
                 // 如果提供了 app_data_dir，则缓存封面到磁盘，并清除 cover 字段以减少传输量
                 // 使用 crate 绝对路径引用 covers
                 if let Some(path) = crate::modules::library::covers::save_cover(dir, &album, &artist, &data_url) {
                      resolved_cover_path = Some(path);
                 }
                 // 既然已经缓存了路径，就不再返回 base64 数据
            } else {
                 cover_base64 = Some(data_url);
            }
        }
    }

    Ok(SongMetadata {
        id: None,
        title,
        artist,
        album,
        duration,
        cover: cover_base64,
        cover_path: resolved_cover_path,
        path: Some(path_obj.display().to_string().replace('\\', "/")),
        size,
        sample_rate,
        bitrate,
        album_artist,
        year,
        genre,
        track_number,
        track_total,
        disc_number,
        disc_total,
        play_count: None,
        last_played_at: None,
        is_favorite: None,
        rating: None,
        unique_id: None,
    })
}
