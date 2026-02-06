// 视频扫描相关命令
// ============================================================================

use crate::DbState;
use crate::modules::database::VideoRepo;
use crate::modules::database::{FolderRepo, LibraryFolder, Video};
use crate::modules::library::video_scanner;
use crate::modules::library::video_thumbnails;
use serde::Serialize;
use std::path::Path;
use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};
use tauri::{Emitter, Manager, State};

#[derive(Serialize, Clone)]
struct ScanProgressPayload {
    folder_id: i64,
    processed: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
struct ScanCompletePayload {
    folder_id: i64,
}

struct VideoWorkItem {
    path: String,
    folder_id: i64,
    existing_id: Option<i64>,
    should_restore: bool,
}

struct VideoWorkResult {
    item: VideoWorkItem,
    meta: Option<video_scanner::RawVideoMetadata>,
    thumbnail_path: Option<String>,
}

fn compute_worker_count(total: usize) -> usize {
    if total == 0 {
        return 0;
    }
    let available = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let capped = available.clamp(1, 8);
    capped.min(total)
}

fn process_video_metadata_parallel(
    app_handle: &tauri::AppHandle,
    folder_id: i64,
    items: Vec<VideoWorkItem>,
) -> Vec<VideoWorkResult> {
    let total = items.len();
    if total == 0 {
        return Vec::new();
    }

    let worker_count = compute_worker_count(total);
    let mut buckets: Vec<Vec<VideoWorkItem>> = (0..worker_count).map(|_| Vec::new()).collect();
    for (idx, item) in items.into_iter().enumerate() {
        buckets[idx % worker_count].push(item);
    }

    let processed = Arc::new(AtomicUsize::new(0));
    let app_handle = app_handle.clone();
    let mut results = Vec::new();

    std::thread::scope(|s| {
        let mut handles = Vec::new();
        for bucket in buckets {
            let processed = Arc::clone(&processed);
            let app_handle = app_handle.clone();
            handles.push(s.spawn(move || {
                let mut out = Vec::new();
                for item in bucket {
                    let meta = video_scanner::get_video_metadata(&item.path).ok();
                    let thumbnail_path = meta
                        .as_ref()
                        .and_then(|m| video_thumbnails::ensure_video_thumbnail(&app_handle, &m.path).ok().flatten());

                    out.push(VideoWorkResult {
                        item,
                        meta,
                        thumbnail_path,
                    });

                    let count = processed.fetch_add(1, Ordering::Relaxed) + 1;
                    if count % 10 == 0 || count == total {
                        let _ = app_handle.emit(
                            "video_scan_progress",
                            ScanProgressPayload {
                                folder_id,
                                processed: count,
                                total,
                            },
                        );
                    }
                }
                out
            }));
        }

        for handle in handles {
            if let Ok(mut bucket_results) = handle.join() {
                results.append(&mut bucket_results);
            }
        }
    });

    results
}

/// 内部扫描函数
pub(crate) fn scan_videos_internal(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    force_restore: bool,
    restore_folder_id: Option<i64>,
) -> Result<Vec<Video>, String> {
    let folders: Vec<_> = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let all_folders = FolderRepo::get_by_type(&conn, "video").map_err(|e| e.to_string())?;
        if let Some(folder_id) = restore_folder_id {
            all_folders
                .into_iter()
                .filter(|f| f.id == folder_id)
                .collect()
        } else {
            all_folders
        }
    };

    // 2. Scan each folder for videos
    for folder in folders {
        let video_files = video_scanner::scan_video_files_recursive(&folder.path);

        let mut work_items: Vec<VideoWorkItem> = Vec::new();

        {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            // 3. Remove stale videos (not in scan result)
            let stale_videos = VideoRepo::get_videos_not_in_paths(&conn, folder.id, &video_files)
                .map_err(|e| e.to_string())?;

            for stale in stale_videos {
                // Soft delete (archive)
                let _ = VideoRepo::delete(&conn, stale.id);
            }

            // 4. Prepare work items
            for file_path in video_files {
                if let Ok(Some(existing)) = VideoRepo::get_by_path_any_status(&conn, &file_path) {
                    if existing.status == "archived" {
                        let should_restore = force_restore
                            && restore_folder_id
                                .map(|target| existing.folder_id == Some(target))
                                .unwrap_or(true);

                        if should_restore {
                            work_items.push(VideoWorkItem {
                                path: file_path,
                                folder_id: folder.id,
                                existing_id: Some(existing.id),
                                should_restore: true,
                            });
                        }
                    } else if existing.duration == 0 {
                        // 如果时长为 0，说明可能是占位符或者之前的扫描不完整，强制重新扫描
                         work_items.push(VideoWorkItem {
                            path: file_path,
                            folder_id: folder.id,
                            existing_id: Some(existing.id),
                            should_restore: false,
                        });
                    }
                    continue;
                }

                work_items.push(VideoWorkItem {
                    path: file_path,
                    folder_id: folder.id,
                    existing_id: None,
                    should_restore: false,
                });
            }
        }

        let results = process_video_metadata_parallel(&app_handle, folder.id, work_items);

        {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            for result in results {
                let Some(meta) = result.meta else {
                    continue;
                };

                let _ = VideoRepo::upsert(
                    &conn,
                    &meta.path,
                    &meta.title,
                    meta.duration,
                    Some(meta.size as i64),
                    meta.width.map(|w| w as i32),
                    meta.height.map(|h| h as i32),
                    result.thumbnail_path.as_deref(),
                    Some(result.item.folder_id),
                );

                if result.item.should_restore {
                    if let Some(existing_id) = result.item.existing_id {
                        let _ = VideoRepo::restore(&conn, existing_id);
                    }
                }
            }
        }
    }

    // 5. Return all active videos
    let conn = db.0.lock().map_err(|e| e.to_string())?;
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
pub async fn add_video_folder(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    folder: String,
) -> Result<Vec<Video>, String> {
    // Phase 1: Fast Scan & Placeholder Insertion
    let (added_folder_id, videos) = {
        let db_conn = db.0.clone();
        let folder_path = folder.clone();
        
        tauri::async_runtime::spawn_blocking(move || {
            let mut conn = db_conn.lock().map_err(|e| e.to_string())?;
            let tx = conn.transaction().map_err(|e| e.to_string())?;

            // 1. Add Folder
            let folder_id = {
                let folder_row = FolderRepo::add_with_type(&tx, &folder_path, "video")
                    .map_err(|e| e.to_string())?;
                folder_row.id
            };

            // 2. Fast Path Scan
            let video_files = video_scanner::scan_video_files_recursive(&folder_path);
            
            // 3. Batch Insert Placeholders
            for file_path in &video_files {
                match VideoRepo::get_by_path_any_status(&tx, file_path) {
                    Ok(Some(existing)) => {
                        if existing.status == "archived" {
                            let _ = VideoRepo::restore(&tx, existing.id);
                        }
                    }
                    Ok(None) => {
                        let filename = Path::new(file_path)
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unknown")
                            .to_string();
                        let _ = VideoRepo::upsert(
                            &tx,
                            file_path,
                            &filename,
                            0, // Placeholder duration
                            None,
                            None,
                            None,
                            None,
                            Some(folder_id),
                        );
                    }
                    Err(_) => continue,
                }
            }

            tx.commit().map_err(|e| e.to_string())?;

            // Return current videos immediately
            let videos = VideoRepo::get_all(&conn).map_err(|e| e.to_string())?;
            Ok::<(i64, Vec<Video>), String>((folder_id, videos))
        })
        .await
        .map_err(|e| e.to_string())??
    };

    // Phase 2: Background Full Scan
    let app_handle = app_handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db_state = app_handle.state::<DbState>();
        // Re-use logic: scan_videos_internal will pick up placeholder items (duration=0) and process them
        let result = scan_videos_internal(db_state, app_handle.clone(), true, Some(added_folder_id));
        if result.is_ok() {
            let _ = app_handle.emit(
                "video_scan_complete",
                ScanCompletePayload {
                    folder_id: added_folder_id,
                },
            );
        }
    });

    Ok(videos)
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
