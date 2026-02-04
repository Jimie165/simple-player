// 视频扫描相关命令
// ============================================================================

use crate::DbState;
use crate::modules::database::VideoRepo;
use crate::modules::database::{FolderRepo, Video, LibraryFolder};
use crate::modules::library::video_scanner;
use crate::modules::library::video_thumbnails;
use tauri::State;

/// 内部扫描函数
pub(crate) fn scan_videos_internal(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    force_restore: bool,
    restore_folder_id: Option<i64>,
) -> Result<Vec<Video>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // 1. Get video folders only (or specific folder if restore_folder_id is provided)
    let all_folders = FolderRepo::get_by_type(&conn, "video").map_err(|e| e.to_string())?;
    let folders: Vec<_> = if let Some(folder_id) = restore_folder_id {
        all_folders
            .into_iter()
            .filter(|f| f.id == folder_id)
            .collect()
    } else {
        all_folders
    };

    // 2. Scan each folder for videos
    for folder in folders {
        let video_files = video_scanner::scan_video_files_recursive(&folder.path);

        // 3. Remove stale videos (not in scan result)
        let stale_videos = VideoRepo::get_videos_not_in_paths(&conn, folder.id, &video_files)
            .map_err(|e| e.to_string())?;

        for stale in stale_videos {
            // Soft delete (archive)
            let _ = VideoRepo::delete(&conn, stale.id);
        }

        // 4. Update/Insert videos
        for file_path in video_files {
            // Check if video exists with any status
            if let Ok(Some(existing)) = VideoRepo::get_by_path_any_status(&conn, &file_path) {
                if existing.status == "archived" {
                    let should_restore = force_restore
                        && restore_folder_id
                            .map(|target| existing.folder_id == Some(target))
                            .unwrap_or(true);

                    if should_restore {
                        // Restore the archived video
                        if let Ok(meta) = video_scanner::get_video_metadata(&file_path) {
                            let thumbnail_path =
                                video_thumbnails::ensure_video_thumbnail(&app_handle, &meta.path)?;
                            let _ = VideoRepo::upsert(
                                &conn,
                                &meta.path,
                                &meta.title,
                                meta.duration,
                                Some(meta.size as i64),
                                meta.width.map(|w| w as i32),
                                meta.height.map(|h| h as i32),
                                thumbnail_path.as_deref(),
                                Some(folder.id),
                            );
                            let _ = VideoRepo::restore(&conn, existing.id);
                        }
                    }
                }
                continue;
            }

            // New video - insert it
            if let Ok(meta) = video_scanner::get_video_metadata(&file_path) {
                let thumbnail_path =
                    video_thumbnails::ensure_video_thumbnail(&app_handle, &meta.path)?;
                let _ = VideoRepo::upsert(
                    &conn,
                    &meta.path,
                    &meta.title,
                    meta.duration,
                    Some(meta.size as i64),
                    meta.width.map(|w| w as i32),
                    meta.height.map(|h| h as i32),
                    thumbnail_path.as_deref(),
                    Some(folder.id),
                );
            }
        }
    }

    // 5. Return all active videos
    let videos = VideoRepo::get_all(&conn).map_err(|e| e.to_string())?;
    Ok(videos)
}

#[tauri::command]
pub fn scan_videos(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<Video>, String> {
    scan_videos_internal(db, app_handle, false, None)
}

/// 添加文件夹到视频库
#[tauri::command]
pub fn add_video_folder(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    folder: String,
) -> Result<Vec<Video>, String> {
    let added_folder_id = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let folder_row =
            FolderRepo::add_with_type(&conn, &folder, "video").map_err(|e| e.to_string())?;
        folder_row.id
    };

    // 添加后立即扫描：仅恢复该文件夹内已归档视频
    scan_videos_internal(db, app_handle, true, Some(added_folder_id))
}

/// 获取视频文件夹
#[tauri::command]
pub fn get_video_folders(
    db: State<'_, DbState>,
) -> Result<Vec<LibraryFolder>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let folders = FolderRepo::get_by_type(&conn, "video").map_err(|e| e.to_string())?;
    Ok(folders)
}
