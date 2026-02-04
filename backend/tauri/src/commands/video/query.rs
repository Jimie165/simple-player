// 视频查询相关命令
// ============================================================================

use std::path::Path;
use crate::DbState;
use crate::modules::database::{VideoRepo, Video};
use crate::modules::library::video_thumbnails;
use crate::utils::path::normalize_windows_path;
use tauri::State;

#[tauri::command]
pub fn get_all_videos(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<Video>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut videos = VideoRepo::get_all(&conn).map_err(|e| e.to_string())?;

    for v in &mut videos {
        let needs_thumb = match &v.thumbnail_path {
            None => true,
            Some(p) => {
                let win_path = normalize_windows_path(p);
                !Path::new(&win_path).exists()
            }
        };

        if !needs_thumb {
            continue;
        }

        let thumbnail_path = video_thumbnails::ensure_video_thumbnail(&app_handle, &v.path)?;
        if let Some(tp) = thumbnail_path {
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
            v.thumbnail_path = Some(tp);
        }
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
