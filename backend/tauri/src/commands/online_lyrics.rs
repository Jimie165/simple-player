use crate::DbState;
use crate::modules::database::SongRepo;
use crate::modules::online_lyrics::{self, Candidate, LyricsPayload, SearchResponse};
use crate::utils::path::normalize_db_path;
use std::path::Path;
use tauri::State;

/// Requests run on the blocking pool, outside the UI and database locks.
#[tauri::command]
pub async fn search_online_lyrics(
    keyword: String,
    provider: String,
) -> Result<SearchResponse, String> {
    tauri::async_runtime::spawn_blocking(move || online_lyrics::search(&keyword, &provider))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn fetch_online_lyrics(candidate: Candidate) -> Result<LyricsPayload, String> {
    tauri::async_runtime::spawn_blocking(move || online_lyrics::fetch(&candidate))
        .await
        .map_err(|e| e.to_string())?
}

/// Save only lyrics, never stale track metadata. Check embedded/local lyrics outside the DB lock.
#[tauri::command]
pub async fn save_online_lyrics_if_missing(
    db: State<'_, DbState>,
    id: i64,
    path: String,
    lyrics: String,
) -> Result<bool, String> {
    if lyrics.trim().is_empty() || lyrics.len() > 4 * 1024 * 1024 {
        return Err("无效在线歌词".into());
    }
    let check_path = path.clone();
    let existing = tauri::async_runtime::spawn_blocking(move || {
        crate::modules::library::get_lyrics(&check_path)
    })
    .await
    .map_err(|e| e.to_string())??;
    if existing
        .lines
        .iter()
        .any(|line| !line.text.trim().is_empty())
    {
        return Ok(false);
    }
    let db_path = normalize_db_path(Path::new(&path));
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    SongRepo::set_lyrics_if_missing(&conn, id, &db_path, &lyrics).map_err(|e| e.to_string())
}
