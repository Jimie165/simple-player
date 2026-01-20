use crate::modules::database::{PlaylistRepo, Playlist};
use crate::modules::library::SongMetadata;
use crate::DbState;
use tauri::State;

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

/// 重命名播放列表
#[tauri::command]
pub fn rename_playlist(db: State<'_, DbState>, id: i64, name: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::update_name(&conn, id, &name).map_err(|e| e.to_string())
}

/// 添加歌曲到播放列表
#[tauri::command]
pub fn add_to_playlist(db: State<'_, DbState>, playlist_id: i64, song_id: i64) -> Result<(), String> {
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
pub fn remove_from_playlist(db: State<'_, DbState>, playlist_id: i64, song_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlaylistRepo::remove_song(&conn, playlist_id, song_id).map_err(|e| e.to_string())
}

/// 获取播放列表中的歌曲
#[tauri::command]
pub fn get_playlist_songs(db: State<'_, DbState>, playlist_id: i64) -> Result<Vec<SongMetadata>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let songs = PlaylistRepo::get_songs(&conn, playlist_id).map_err(|e| e.to_string())?;
    Ok(songs.iter().map(SongMetadata::from_db_song).collect())
}
