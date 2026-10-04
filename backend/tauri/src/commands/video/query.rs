// 视频查询相关命令
// ============================================================================

use crate::DbState;
use crate::modules::database::{Video, VideoRepo};
use crate::modules::library::video_thumbnails;
use crate::utils::path::normalize_windows_path;
use serde::Serialize;
use std::path::Path;
use tauri::{Emitter, Manager, State};

#[derive(Serialize, Clone)]
struct ThumbnailReadyPayload {
    video_id: i64,
    thumbnail_path: String,
}

fn video_path_exists(path: &str) -> Result<bool, String> {
    Path::new(&normalize_windows_path(path))
        .try_exists()
        .map_err(|error| error.to_string())
}

/// Only a missing path returns false; access errors must not offer library removal.
#[tauri::command]
pub async fn video_file_exists(path: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || video_path_exists(&path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn get_all_videos(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<Video>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let videos = VideoRepo::get_all(&conn).map_err(|e| e.to_string())?;

    let missing_thumbnails: Vec<Video> = videos
        .iter()
        .filter(|v| match &v.thumbnail_path {
            None => true,
            Some(p) => {
                let win_path = normalize_windows_path(p);
                !Path::new(&win_path).exists()
            }
        })
        .cloned()
        .collect();

    if !missing_thumbnails.is_empty() {
        let app_handle = app_handle.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let db_state = app_handle.state::<DbState>();
            for v in missing_thumbnails {
                let thumbnail_path = video_thumbnails::ensure_video_thumbnail(&app_handle, &v.path)
                    .ok()
                    .flatten();
                let Some(tp) = thumbnail_path else {
                    continue;
                };

                if let Ok(conn) = db_state.0.lock() {
                    let _ = VideoRepo::upsert(
                        &conn,
                        &v.path,
                        &v.title,
                        v.duration,
                        v.size,
                        v.width,
                        v.height,
                        Some(tp.as_str()),
                        v.folder_id,
                    );
                }

                let _ = app_handle.emit(
                    "video_thumbnail_ready",
                    ThumbnailReadyPayload {
                        video_id: v.id,
                        thumbnail_path: tp,
                    },
                );
            }
        });
    }
    Ok(videos)
}

/// 搜索视频
#[tauri::command]
pub fn search_videos(db: State<'_, DbState>, query: String) -> Result<Vec<Video>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let videos = VideoRepo::search(&conn, &query).map_err(|e| e.to_string())?;
    Ok(videos)
}

#[tauri::command]
pub fn toggle_video_favorite(db: State<'_, DbState>, video_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    VideoRepo::toggle_favorite(&conn, video_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn batch_delete_videos(db: State<'_, DbState>, ids: Vec<i64>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    VideoRepo::batch_delete(&conn, &ids).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_path_check_detects_deleted_files_with_database_paths() {
        let path = std::env::temp_dir().join(format!(
            "simple-player-video-check-{}-{}.mp4",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let db_path = crate::utils::path::normalize_db_path(&path);
        std::fs::write(&path, b"video fixture").unwrap();
        assert_eq!(video_path_exists(&db_path), Ok(true));
        std::fs::remove_file(&path).unwrap();
        assert_eq!(video_path_exists(&db_path), Ok(false));
    }
}
