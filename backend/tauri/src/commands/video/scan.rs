// 视频扫描相关命令
// ============================================================================

use crate::DbState;
use crate::commands::library::load_video_ignored_dirs;
use crate::modules::database::VideoRepo;
use crate::modules::database::{FolderRepo, LibraryFolder, Video};
use crate::modules::library::video_scanner;
use crate::modules::library::video_thumbnails;
use crate::utils::path::normalize_folder_path;
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
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

#[derive(Serialize)]
pub struct AddVideoFolderResult {
    videos: Vec<Video>,
    existing_folder: bool,
    archived_videos: Vec<Video>,
}

#[derive(Serialize)]
pub struct RestoreArchivedVideosResult {
    videos: Vec<Video>,
    restored_count: usize,
    missing_count: usize,
}

struct VideoWorkItem {
    path: String,
    folder_id: i64,
    existing_id: Option<i64>,
    should_restore: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum VideoRefreshMode {
    Incremental,
    ForceReextract,
}

struct VideoWorkResult {
    item: VideoWorkItem,
    meta: Option<video_scanner::RawVideoMetadata>,
    thumbnail_path: Option<String>,
}

/// 判断 `child` 是否是 `parent` 的子路径（要求两端都已经过 `normalize_folder_path` 处理）。
fn is_subpath_of(child: &str, parent: &str) -> bool {
    if child.len() <= parent.len() {
        return false;
    }

    if child.as_bytes().get(parent.len()) != Some(&b'/') {
        return false;
    }

    let Some(c_head) = child.get(..parent.len()) else {
        return false;
    };
    let p_head = parent;

    if cfg!(windows) {
        c_head.eq_ignore_ascii_case(p_head)
    } else {
        c_head == p_head
    }
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
                    let meta = video_scanner::get_video_metadata(&app_handle, &item.path).ok();
                    let thumbnail_path = meta.as_ref().and_then(|m| {
                        video_thumbnails::ensure_video_thumbnail(&app_handle, &m.path)
                            .ok()
                            .flatten()
                    });

                    out.push(VideoWorkResult {
                        item,
                        meta,
                        thumbnail_path,
                    });

                    let count = processed.fetch_add(1, Ordering::Relaxed) + 1;
                    if count.is_multiple_of(10) || count == total {
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
fn scan_videos_internal(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    force_restore: bool,
    restore_folder_id: Option<i64>,
    refresh_mode: VideoRefreshMode,
) -> Result<Vec<Video>, String> {
    let (folders, ignored_dirs): (Vec<_>, Vec<String>) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let all_folders = FolderRepo::get_by_type(&conn, "video").map_err(|e| e.to_string())?;
        let folders = if let Some(folder_id) = restore_folder_id {
            all_folders
                .into_iter()
                .filter(|f| f.id == folder_id)
                .collect()
        } else {
            all_folders
        };
        (folders, load_video_ignored_dirs(&conn))
    };

    // 2. Scan each folder for videos
    for folder in folders {
        let video_files = video_scanner::scan_video_files_recursive(&folder.path, &ignored_dirs);

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
                    } else if refresh_mode == VideoRefreshMode::ForceReextract
                        || existing.duration == 0
                        || existing.thumbnail_path.is_none()
                    {
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

                if result.item.should_restore
                    && let Some(existing_id) = result.item.existing_id
                {
                    let _ = VideoRepo::restore(&conn, existing_id);
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
    let videos = scan_videos_internal(
        db,
        app_handle.clone(),
        false,
        None,
        VideoRefreshMode::ForceReextract,
    )?;
    let _ = app_handle.emit("video_scan_complete", ScanCompletePayload { folder_id: 0 });
    Ok(videos)
}

/// 添加文件夹到视频库
#[tauri::command]
pub async fn add_video_folder(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    folder: String,
) -> Result<AddVideoFolderResult, String> {
    let folder = normalize_folder_path(&folder);

    let existing_folder_id = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let existing = FolderRepo::get_by_type(&conn, "video").map_err(|e| e.to_string())?;
        let mut exact_match = None;
        for f in &existing {
            if f.path == folder {
                exact_match = Some(f.id);
                break;
            }
            if is_subpath_of(&folder, &f.path) {
                return Err(format!("该目录已被父目录覆盖：{}", f.path));
            }
            if is_subpath_of(&f.path, &folder) {
                return Err(format!(
                    "已存在子目录 {}，请先在视频库中移除该子目录后再添加父目录",
                    f.path
                ));
            }
        }
        exact_match
    };

    if let Some(folder_id) = existing_folder_id {
        let ignored_dirs = {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            load_video_ignored_dirs(&conn)
        };
        let scan_folder = folder.clone();
        let available_paths: HashSet<String> = tauri::async_runtime::spawn_blocking(move || {
            video_scanner::scan_video_files_recursive(&scan_folder, &ignored_dirs)
                .into_iter()
                .collect()
        })
        .await
        .map_err(|e| e.to_string())?;

        let (videos, archived_videos) = {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let videos = VideoRepo::get_all(&conn).map_err(|e| e.to_string())?;
            let archived =
                VideoRepo::get_archived_by_folder(&conn, folder_id).map_err(|e| e.to_string())?;
            let archived_videos = archived
                .into_iter()
                .filter(|video| available_paths.contains(&video.path))
                .collect();
            (videos, archived_videos)
        };

        return Ok(AddVideoFolderResult {
            videos,
            existing_folder: true,
            archived_videos,
        });
    }

    let ignored_dirs = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        load_video_ignored_dirs(&conn)
    };

    // Phase 1: Fast Scan & Placeholder Insertion
    let (added_folder_id, videos) = {
        let db_conn = db.0.clone();
        let folder_path = folder.clone();
        let ignored_dirs = ignored_dirs.clone();

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
            let video_files =
                video_scanner::scan_video_files_recursive(&folder_path, &ignored_dirs);

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
        let result = scan_videos_internal(
            db_state,
            app_handle.clone(),
            true,
            Some(added_folder_id),
            VideoRefreshMode::Incremental,
        );
        if result.is_ok() {
            let _ = app_handle.emit(
                "video_scan_complete",
                ScanCompletePayload {
                    folder_id: added_folder_id,
                },
            );
        }
    });

    Ok(AddVideoFolderResult {
        videos,
        existing_folder: false,
        archived_videos: Vec::new(),
    })
}

/// 恢复用户在重新选择视频文件夹后明确勾选的视频。
#[tauri::command]
pub fn restore_archived_videos(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    ids: Vec<i64>,
) -> Result<RestoreArchivedVideosResult, String> {
    let candidates = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        ids.iter()
            .filter_map(|id| VideoRepo::get_by_id(&conn, *id).ok().flatten())
            .filter(|video| video.status == "archived")
            .collect::<Vec<_>>()
    };

    // 文件存在性检查必须在数据库锁外进行。
    let restorable_ids = candidates
        .iter()
        .filter(|video| Path::new(&video.path).is_file())
        .map(|video| video.id)
        .collect::<Vec<_>>();
    let missing_count = candidates.len().saturating_sub(restorable_ids.len());

    let (restored_count, videos) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let restored_count =
            VideoRepo::batch_restore_archived(&conn, &restorable_ids).map_err(|e| e.to_string())?;
        let videos = VideoRepo::get_all(&conn).map_err(|e| e.to_string())?;
        (restored_count, videos)
    };

    let _ = app_handle.emit("video_scan_complete", ScanCompletePayload { folder_id: 0 });

    Ok(RestoreArchivedVideosResult {
        videos,
        restored_count,
        missing_count,
    })
}

/// 获取视频文件夹
#[tauri::command]
pub fn get_video_folders(db: State<'_, DbState>) -> Result<Vec<LibraryFolder>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let folders = FolderRepo::get_by_type(&conn, "video").map_err(|e| e.to_string())?;
    Ok(folders)
}

#[tauri::command]
pub fn remove_video_folder(
    db: State<'_, DbState>,
    folder: String,
) -> Result<Vec<LibraryFolder>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    if !FolderRepo::remove_video(&conn, &folder).map_err(|error| error.to_string())? {
        return Err(format!("未找到视频文件夹记录：{}", folder));
    }

    let folders = FolderRepo::get_by_type(&conn, "video").map_err(|e| e.to_string())?;
    Ok(folders)
}
