// 数据模型定义
// ============================================================================

use serde::{Deserialize, Serialize};

/// 音乐库文件夹
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryFolder {
    pub id: i64,
    pub path: String,
    pub folder_type: String,
    pub created_at: String,
}

/// 歌曲
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: i64,
    pub cover: Option<String>,      // Deprecated: 保留字段，不再使用 base64
    pub cover_path: Option<String>, // 音乐文件内嵌封面的缓存路径
    pub artwork_path: Option<String>, // 应用管理的自定义覆盖封面
    pub folder_id: Option<i64>,
    // 扩展元数据
    pub album_artist: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub track_number: Option<i32>,
    pub track_total: Option<i32>,
    pub disc_number: Option<i32>,
    pub disc_total: Option<i32>,
    // 用户数据
    pub play_count: i32,
    pub last_played_at: Option<String>,
    pub is_favorite: bool,
    pub rating: Option<i32>,
    pub lyrics_text: Option<String>,
    pub lyrics_source_path: Option<String>,
    pub lyrics_offset_ms: i32,
    pub status: String, // 'active' | 'missing' | 'excluded'
    pub created_at: String,
    pub updated_at: String,
    // Join Table ID (for playlist items)
    pub unique_id: Option<i64>,
}

/// 播放列表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub cover_path: Option<String>,
    pub description: Option<String>,
    pub song_count: i32,
    pub last_played_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 播放列表歌曲关联
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistSong {
    pub id: i64,
    pub playlist_id: i64,
    pub song_id: i64,
    pub position: i64,
}

/// 播放队列项
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayQueueItem {
    pub id: i64,
    pub song_id: i64,
    pub position: i64,
}
