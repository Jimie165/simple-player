use crate::utils::path::normalize_db_path;
use lofty::id3::v2::{
    Frame, Id3v2Tag, SyncTextContentType, SynchronizedTextFrame, TimestampFormat,
};
use lofty::prelude::*;
use lofty::read_from_path;
use lofty::tag::{ItemKey, TagType};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LyricsLine {
    pub time_ms: Option<u32>,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub translation: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LyricsData {
    pub lines: Vec<LyricsLine>,
    pub has_timestamps: bool,
    pub offset_ms: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SongMetadata {
    pub id: Option<i64>,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u64,
    pub cover: Option<String>,      // Deprecated: 保留字段，不再使用 base64
    pub cover_path: Option<String>, // 当前生效的封面路径
    pub embedded_cover_path: Option<String>,
    pub artwork_path: Option<String>,
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
    pub lyrics_text: Option<String>,
    pub lyrics_source_path: Option<String>,
    pub lyrics_offset_ms: i32,
    pub unique_id: Option<i64>, // Playlist Entry ID
    // 媒体详细信息
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<f64>,
    pub channels: Option<u8>,
}

fn build_unsynced_lyrics(content: &str) -> Option<LyricsData> {
    if content.trim().is_empty() {
        return None;
    }

    let lines: Vec<LyricsLine> = content
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .map(|line| LyricsLine {
            time_ms: None,
            text: line.to_string(),
            translation: None,
        })
        .collect();

    Some(LyricsData {
        lines,
        has_timestamps: false,
        offset_ms: 0,
    })
}

pub fn lyrics_from_text(content: &str) -> LyricsData {
    build_unsynced_lyrics(content).unwrap_or(LyricsData {
        lines: Vec::new(),
        has_timestamps: false,
        offset_ms: 0,
    })
}

fn build_synced_lyrics(frame: &SynchronizedTextFrame<'_>) -> Option<LyricsData> {
    let mut lines = Vec::new();
    let mut has_timestamps = false;

    for (time, text) in &frame.content {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }

        let time_ms = match frame.timestamp_format {
            TimestampFormat::MS => Some(*time),
            TimestampFormat::MPEG => None,
        };

        if time_ms.is_some() {
            has_timestamps = true;
        }

        lines.push(LyricsLine {
            time_ms,
            text: trimmed.to_string(),
            translation: None,
        });
    }

    if lines.is_empty() {
        return None;
    }

    Some(LyricsData {
        lines,
        has_timestamps,
        offset_ms: 0,
    })
}

fn extract_id3v2_lyrics(tag: &Id3v2Tag) -> Option<LyricsData> {
    let mut fallback: Option<LyricsData> = None;

    for frame in tag {
        let Frame::Binary(binary) = frame else {
            continue;
        };
        if binary.id().as_str() != "SYLT" {
            continue;
        }

        let Ok(sync_frame) = SynchronizedTextFrame::parse(&binary.data, binary.flags()) else {
            continue;
        };

        if let Some(lyrics) = build_synced_lyrics(&sync_frame) {
            if matches!(
                sync_frame.content_type,
                SyncTextContentType::Lyrics | SyncTextContentType::TextTranscription
            ) {
                return Some(lyrics);
            }
            if fallback.is_none() {
                fallback = Some(lyrics);
            }
        }
    }

    fallback
}

pub fn get_lyrics(path: &str) -> Result<LyricsData, String> {
    let path_obj = Path::new(path);
    let tagged_file =
        read_from_path(path_obj).map_err(|e| format!("Failed to read metadata: {}", e))?;

    if let Some(tag) = tagged_file.tag(TagType::Id3v2) {
        let id3v2_tag: Id3v2Tag = tag.clone().into();

        if let Some(lyrics) = extract_id3v2_lyrics(&id3v2_tag) {
            return Ok(lyrics);
        }

        if let Some(frame) = id3v2_tag.unsync_text().next()
            && let Some(lyrics) = build_unsynced_lyrics(&frame.content)
        {
            return Ok(lyrics);
        }
    }

    if let Some(tag) = tagged_file.primary_tag()
        && let Some(content) = tag.get_string(&ItemKey::Lyrics)
        && let Some(lyrics) = build_unsynced_lyrics(content)
    {
        return Ok(lyrics);
    }

    Ok(LyricsData {
        lines: Vec::new(),
        has_timestamps: false,
        offset_ms: 0,
    })
}

pub fn get_raw_lyrics(path: &str) -> Result<Option<String>, String> {
    let path_obj = Path::new(path);
    let tagged_file =
        read_from_path(path_obj).map_err(|e| format!("Failed to read metadata: {}", e))?;

    if let Some(tag) = tagged_file.tag(TagType::Id3v2) {
        let id3v2_tag: Id3v2Tag = tag.clone().into();

        if let Some(frame) = id3v2_tag.unsync_text().next() {
            let content = frame.content.trim();
            if !content.is_empty() {
                return Ok(Some(content.to_string()));
            }
        }

        if let Some(lyrics) = extract_id3v2_lyrics(&id3v2_tag) {
            let content = lyrics
                .lines
                .iter()
                .map(|line| match line.time_ms {
                    Some(ms) => {
                        let minutes = ms / 60000;
                        let seconds = (ms % 60000) / 1000;
                        let hundredths = (ms % 1000) / 10;
                        format!(
                            "[{:02}:{:02}.{:02}]{}",
                            minutes, seconds, hundredths, line.text
                        )
                    }
                    None => line.text.clone(),
                })
                .collect::<Vec<_>>()
                .join("\n");
            if !content.trim().is_empty() {
                return Ok(Some(content));
            }
        }
    }

    if let Some(tag) = tagged_file.primary_tag()
        && let Some(content) = tag.get_string(&ItemKey::Lyrics)
    {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_string()));
        }
    }

    Ok(None)
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
            cover_path: song
                .artwork_path
                .clone()
                .or_else(|| song.cover_path.clone()),
            embedded_cover_path: song.cover_path.clone(),
            artwork_path: song.artwork_path.clone(),
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
            lyrics_text: song.lyrics_text.clone(),
            lyrics_source_path: song.lyrics_source_path.clone(),
            lyrics_offset_ms: song.lyrics_offset_ms,
            unique_id: song.unique_id,
            width: None,
            height: None,
            frame_rate: None,
            channels: None,
        }
    }
}

// 引用 covers 模块
// 注意：需要在文件头部确保能引用到 crate::modules::library::covers
// 由于是在同一个 mod 下，使用 super::covers 或者 crate::modules::library::covers

/// 从文件读取完整元数据
pub fn get_metadata(path: &str, app_cache_dir: Option<&Path>) -> Result<SongMetadata, String> {
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
        .unwrap_or_else(|| {
            path_obj
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown Title")
                .to_string()
        });

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

    let genre = tag.as_ref().and_then(|t| t.genre().map(|s| s.to_string()));

    let track_number = tag.as_ref().and_then(|t| t.track()).map(|n| n as i32);

    let track_total = tag.as_ref().and_then(|t| t.track_total()).map(|n| n as i32);

    let disc_number = tag.as_ref().and_then(|t| t.disk()).map(|n| n as i32);

    let disc_total = tag.as_ref().and_then(|t| t.disk_total()).map(|n| n as i32);

    // 获取音频属性
    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs();
    let sample_rate = properties.sample_rate();
    let bitrate = properties.audio_bitrate();
    let channels = properties.channels();

    // 获取封面图片
    let mut resolved_cover_path = None;

    if let Some(t) = tag
        && let Some(picture) = t.pictures().first()
    {
        let mime_type = picture
            .mime_type()
            .map(|m| m.as_str())
            .unwrap_or("image/jpeg");

        if let Some(dir) = app_cache_dir {
            // 如果提供了 app_cache_dir，则缓存封面到磁盘，并清除 cover 字段以减少传输量
            // 使用 crate 绝对路径引用 covers
            if let Some(path) =
                crate::modules::library::covers::save_cover_bytes(dir, picture.data(), mime_type)
            {
                resolved_cover_path = Some(path);
            }
        }
    }

    Ok(SongMetadata {
        id: None,
        title,
        artist,
        album,
        duration,
        cover: None,
        cover_path: resolved_cover_path,
        embedded_cover_path: None,
        artwork_path: None,
        path: Some(normalize_db_path(path_obj)),
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
        lyrics_text: None,
        lyrics_source_path: None,
        lyrics_offset_ms: 0,
        unique_id: None,
        width: None,
        height: None,
        frame_rate: None,
        channels,
    })
}
