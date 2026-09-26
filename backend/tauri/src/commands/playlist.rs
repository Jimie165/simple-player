use crate::DbState;
use crate::modules::database::{Playlist, PlaylistRepo};
use crate::modules::library::SongMetadata;
use crate::utils::paths::resolve_app_path;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use tauri::{AppHandle, State};

const PLAYLIST_COLLAGE_COVER_COUNT: usize = 4;

fn cover_content_fingerprint(app: &AppHandle, cover_path: &str) -> Option<[u8; 32]> {
    let path = resolve_app_path(app, cover_path).or_else(|| {
        let path = PathBuf::from(cover_path);
        path.is_absolute().then_some(path)
    })?;
    let mut file = File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 16 * 1024];

    loop {
        let read = file.read(&mut buffer).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Some(hasher.finalize().into())
}

fn take_unique_cover_paths<F>(paths: Vec<String>, mut fingerprint: F) -> Vec<String>
where
    F: FnMut(&str) -> Option<[u8; 32]>,
{
    let mut seen_paths = HashSet::new();
    let mut seen_content = HashSet::new();
    let mut selected = Vec::with_capacity(PLAYLIST_COLLAGE_COVER_COUNT);

    for path in paths {
        if !seen_paths.insert(path.clone()) {
            continue;
        }
        if fingerprint(&path).is_some_and(|hash| !seen_content.insert(hash)) {
            continue;
        }

        selected.push(path);
        if selected.len() == PLAYLIST_COLLAGE_COVER_COUNT {
            break;
        }
    }

    selected
}

/// 获取所有播放列表
#[tauri::command]
pub fn get_playlists(db: State<'_, DbState>) -> Result<Vec<Playlist>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::get_all(&conn).map_err(|e| e.to_string())
}

/// 创建播放列表
#[tauri::command]
pub fn create_playlist(db: State<'_, DbState>, name: String) -> Result<Playlist, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::create(&conn, &name).map_err(|e| e.to_string())
}

/// 删除播放列表
#[tauri::command]
pub fn delete_playlist(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::delete(&conn, id).map_err(|e| e.to_string())
}

/// 重命名播放列表 (兼容旧接口)
#[tauri::command]
pub fn rename_playlist(db: State<'_, DbState>, id: i64, name: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::update_info(&conn, id, &name, None).map_err(|e| e.to_string())
}

/// 更新播放列表信息
#[tauri::command]
pub fn update_playlist_info(
    db: State<'_, DbState>,
    id: i64,
    name: String,
    description: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::update_info(&conn, id, &name, description.as_deref()).map_err(|e| e.to_string())
}

/// 更新播放列表封面
#[tauri::command]
pub fn update_playlist_cover(
    db: State<'_, DbState>,
    id: i64,
    cover_path: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::update_cover(&conn, id, cover_path.as_deref()).map_err(|e| e.to_string())
}

/// 添加歌曲到播放列表
#[tauri::command]
pub fn add_to_playlist(
    db: State<'_, DbState>,
    playlist_id: i64,
    song_id: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::add_song(&conn, playlist_id, song_id).map_err(|e| e.to_string())
}

/// 批量添加歌曲到播放列表
#[tauri::command]
pub fn batch_add_to_playlist(
    db: State<'_, DbState>,
    playlist_id: i64,
    song_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::batch_add_songs(&conn, playlist_id, &song_ids).map_err(|e| e.to_string())
}

/// 从播放列表移除歌曲
#[tauri::command]
pub fn remove_from_playlist(
    db: State<'_, DbState>,
    playlist_id: i64,
    song_id: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::remove_song(&conn, playlist_id, song_id).map_err(|e| e.to_string())
}

/// 批量从播放列表移除歌曲
#[tauri::command]
pub fn batch_remove_from_playlist(
    db: State<'_, DbState>,
    playlist_id: i64,
    song_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::batch_remove_songs(&conn, playlist_id, &song_ids).map_err(|e| e.to_string())
}

/// 批量从播放列表移除项 (通过 unique_id)
#[tauri::command]
pub fn batch_remove_playlist_items(
    db: State<'_, DbState>,
    playlist_id: i64,
    unique_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::batch_remove_playlist_items(&conn, playlist_id, &unique_ids)
        .map_err(|e| e.to_string())
}

/// 重新排序播放列表歌曲
#[tauri::command]
pub fn reorder_playlist_songs(
    db: State<'_, DbState>,
    playlist_id: i64,
    song_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::reorder_songs(&conn, playlist_id, &song_ids).map_err(|e| e.to_string())
}

/// 获取播放列表中的歌曲
#[tauri::command]
pub fn get_playlist_songs(
    db: State<'_, DbState>,
    playlist_id: i64,
) -> Result<Vec<SongMetadata>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let songs = PlaylistRepo::get_songs(&conn, playlist_id).map_err(|e| e.to_string())?;
    Ok(songs.iter().map(SongMetadata::from_db_song).collect())
}

/// 获取播放列表卡片所需的最多四张不同封面。
#[tauri::command]
pub fn get_playlist_cover_paths(
    app: AppHandle,
    db: State<'_, DbState>,
    playlist_id: i64,
    ordered_cover_paths: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    let mut candidates = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        PlaylistRepo::get_cover_paths(&conn, playlist_id).map_err(|e| e.to_string())?
    };

    if let Some(paths) = ordered_cover_paths {
        // 按歌曲顺序排列候选封面后，再按图片内容去重并截取四张。
        let mut positions = std::collections::HashMap::new();
        for (index, path) in paths.iter().enumerate() {
            positions.entry(path.as_str()).or_insert(index);
        }
        candidates.sort_by_key(|path| positions.get(path.as_str()).copied().unwrap_or(usize::MAX));
    }

    Ok(take_unique_cover_paths(candidates, |path| {
        cover_content_fingerprint(&app, path)
    }))
}
/// 标记播放列表为已播放（更新 last_played_at）
#[tauri::command]
pub fn mark_playlist_as_played(db: State<'_, DbState>, playlist_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::update_last_played(&conn, playlist_id).map_err(|e| e.to_string())
}
