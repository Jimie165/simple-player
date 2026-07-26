use crate::DbState;
use crate::modules::database::PlayQueueRepo;
use crate::modules::library::SongMetadata;
use tauri::State;

/// 保存播放队列
#[tauri::command]
pub fn save_play_queue(db: State<'_, DbState>, song_ids: Vec<i64>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlayQueueRepo::save(&conn, &song_ids).map_err(|e| e.to_string())
}

/// 获取播放队列
#[tauri::command]
pub fn get_play_queue(db: State<'_, DbState>) -> Result<Vec<SongMetadata>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let songs = PlayQueueRepo::get_songs(&conn).map_err(|e| e.to_string())?;
    Ok(songs.iter().map(SongMetadata::from_db_song).collect())
}

/// 清空播放队列
#[tauri::command]
pub fn clear_play_queue(db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    PlayQueueRepo::clear(&conn).map_err(|e| e.to_string())
}
