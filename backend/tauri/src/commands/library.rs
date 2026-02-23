use crate::DbState;
use crate::modules::database::{FolderRepo, LibraryFolder, SongRepo};
use crate::modules::library::{self, SongMetadata};
use crate::utils::paths::{is_app_relative_path, is_user_file_path};
use rusqlite::Connection;
use serde::Serialize;
use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};
use std::path::Path;
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

struct SongWorkItem {
    path: String,
    folder_id: i64,
    existing_id: Option<i64>,
    should_restore: bool,
    is_new: bool,
}

struct SongWorkResult {
    item: SongWorkItem,
    meta: Option<SongMetadata>,
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

fn process_song_metadata_parallel(
    app_handle: &tauri::AppHandle,
    app_cache_dir: &Path,
    folder_id: i64,
    items: Vec<SongWorkItem>,
) -> Vec<SongWorkResult> {
    let total = items.len();
    if total == 0 {
        return Vec::new();
    }

    let worker_count = compute_worker_count(total);
    let mut buckets: Vec<Vec<SongWorkItem>> = (0..worker_count).map(|_| Vec::new()).collect();
    for (idx, item) in items.into_iter().enumerate() {
        buckets[idx % worker_count].push(item);
    }

    let processed = Arc::new(AtomicUsize::new(0));
    let app_cache_dir = app_cache_dir.to_path_buf();
    let app_handle = app_handle.clone();
    let mut results = Vec::new();

    std::thread::scope(|s| {
        let mut handles = Vec::new();
        for bucket in buckets {
            let processed = Arc::clone(&processed);
            let app_handle = app_handle.clone();
            let app_cache_dir = app_cache_dir.clone();
            handles.push(s.spawn(move || {
                let mut out = Vec::new();
                for item in bucket {
                    let meta = library::get_metadata(&item.path, Some(&app_cache_dir)).ok();
                    out.push(SongWorkResult { item, meta });
                    let count = processed.fetch_add(1, Ordering::Relaxed) + 1;
                    if count % 50 == 0 || count == total {
                        let _ = app_handle.emit(
                            "library_scan_progress",
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

fn insert_placeholder_songs(
    conn: &Connection,
    folder_id: i64,
    files: &[String],
) -> Result<(), String> {
    for file in files {
        match SongRepo::get_by_path_any_status(conn, file) {
            Ok(Some(existing)) => {
                if existing.status == "archived" {
                    let _ = SongRepo::restore(conn, existing.id);
                }
            }
            Ok(None) => {
                let p = Path::new(file);
                let filename = p
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string();

                let _ = SongRepo::upsert(
                    conn,
                    file,
                    &filename,
                    "Unknown",
                    "Unknown",
                    0,
                    None,
                    None,
                    Some(folder_id),
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                );
            }
            Err(_) => continue,
        }
    }
    Ok(())
}

async fn scan_library_internal(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    force_restore: bool,
    restore_folder_id: Option<i64>,
) -> Result<Vec<SongMetadata>, String> {
    let app_cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?;

    let folders: Vec<_> = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let all_folders = FolderRepo::get_by_type(&conn, "music").map_err(|e| e.to_string())?;
        if let Some(folder_id) = restore_folder_id {
            all_folders
                .into_iter()
                .filter(|f| f.id == folder_id)
                .collect()
        } else {
            all_folders
        }
    };
    let mut all_songs = Vec::new();

    for folder in folders {
        let files = library::scan_audio_files_recursive(&folder.path);
        let mut work_items: Vec<SongWorkItem> = Vec::new();

        {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let stale_songs = SongRepo::get_songs_not_in_paths(&conn, folder.id, &files)
                .map_err(|e| e.to_string())?;
            for stale in stale_songs {
                let _ = SongRepo::hard_delete(&conn, stale.id);
            }

            for file in files {
                if let Ok(Some(existing)) = SongRepo::get_by_path_any_status(&conn, &file) {
                    // 检查是否需要迁移旧封面路径
                    // 如果封面路径存在，但既不是新的相对路径（cache/），也不是用户绝对路径，则认为是旧格式
                    let needs_migration = existing.cover_path.as_ref().map_or(false, |cp| {
                        !is_app_relative_path(cp) && !is_user_file_path(cp)
                    });

                    // 检查封面文件是否物理存在（解决用户仅迁移数据库未迁移缓存的问题）
                    let cover_missing = existing.cover_path.as_ref().map_or(false, |cp| {
                        if is_app_relative_path(cp) {
                            !app_cache_dir.join(cp).exists()
                        } else {
                            // 对于绝对路径，直接检查是否存在
                            !Path::new(cp).exists()
                        }
                    });

                    if existing.status == "archived" {
                        let should_restore = force_restore
                            && restore_folder_id
                                .map(|target| existing.folder_id == Some(target))
                                .unwrap_or(true);

                        if should_restore {
                            work_items.push(SongWorkItem {
                                path: file,
                                folder_id: folder.id,
                                existing_id: Some(existing.id),
                                should_restore: true,
                                is_new: false,
                            });
                        }
                        continue;
                    }

                    // 检查是否为占位符数据（Artist 或 Album 为 Unknown）
                    let is_placeholder = existing.artist == "Unknown" || existing.album == "Unknown";

                    if !needs_migration && !cover_missing && !is_placeholder {
                        // 状态正常、不需要迁移且封面文件存在且不是占位符，直接使用
                        all_songs.push(SongMetadata::from_db_song(&existing));
                        continue;
                    }

                    work_items.push(SongWorkItem {
                        path: file,
                        folder_id: folder.id,
                        existing_id: Some(existing.id),
                        should_restore: false,
                        is_new: false,
                    });
                    continue;
                }

                work_items.push(SongWorkItem {
                    path: file,
                    folder_id: folder.id,
                    existing_id: None,
                    should_restore: false,
                    is_new: true,
                });
            }
        }

        let results = process_song_metadata_parallel(&app_handle, &app_cache_dir, folder.id, work_items);

        {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            for result in results {
                if let Some(meta) = result.meta {
                    let cover_path = meta.cover_path.clone();

                    if let Some(existing_id) = result.item.existing_id {
                        let _ = SongRepo::update_metadata(
                            &conn,
                            existing_id,
                            &meta.title,
                            &meta.artist,
                            &meta.album,
                            meta.duration as i64,
                            None,
                            cover_path.as_deref(),
                            meta.album_artist.as_deref(),
                            meta.year,
                            meta.genre.as_deref(),
                            meta.track_number,
                            meta.track_total,
                            meta.disc_number,
                            meta.disc_total,
                        );

                        if result.item.should_restore {
                            let _ = SongRepo::restore(&conn, existing_id);
                        }

                        if let Ok(Some(updated)) = SongRepo::get_by_path(&conn, &result.item.path) {
                            all_songs.push(SongMetadata::from_db_song(&updated));
                        }
                    } else {
                        let _ = SongRepo::upsert(
                            &conn,
                            &result.item.path,
                            &meta.title,
                            &meta.artist,
                            &meta.album,
                            meta.duration as i64,
                            None,
                            cover_path.as_deref(),
                            Some(result.item.folder_id),
                            meta.album_artist.as_deref(),
                            meta.year,
                            meta.genre.as_deref(),
                            meta.track_number,
                            meta.track_total,
                            meta.disc_number,
                            meta.disc_total,
                        );

                        if let Ok(Some(inserted)) = SongRepo::get_by_path(&conn, &result.item.path) {
                            all_songs.push(SongMetadata::from_db_song(&inserted));
                        } else {
                            let mut result_meta = meta.clone();
                            result_meta.cover_path = cover_path;
                            result_meta.cover = None;
                            all_songs.push(result_meta);
                        }
                    }
                } else if result.item.is_new {
                    let p = Path::new(&result.item.path);
                    let filename = p
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown")
                        .to_string();

                    let _ = SongRepo::upsert(
                        &conn,
                        &result.item.path,
                        &filename,
                        "Unknown",
                        "Unknown",
                        0,
                        None,
                        None,
                        Some(result.item.folder_id),
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,
                        None,
                    );

                    if let Ok(Some(inserted)) = SongRepo::get_by_path(&conn, &result.item.path) {
                        all_songs.push(SongMetadata::from_db_song(&inserted));
                    }
                } else if let Some(existing_id) = result.item.existing_id {
                    if result.item.should_restore {
                        let _ = SongRepo::restore(&conn, existing_id);
                    }
                }
            }
        }
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let songs = SongRepo::get_all(&conn).map_err(|e| e.to_string())?;
    Ok(songs.iter().map(SongMetadata::from_db_song).collect())
}

/// 获取所有已保存的文件夹路径
#[tauri::command]
pub fn get_library_folders(db: State<'_, DbState>) -> Result<Vec<LibraryFolder>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let folders = FolderRepo::get_all(&conn).map_err(|e| e.to_string())?;
    Ok(folders)
}

/// 添加文件夹到库
#[tauri::command]
pub async fn add_library_folder(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    folder: String,
) -> Result<Vec<SongMetadata>, String> {
    let added_folder_id = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let folder_row = FolderRepo::add(&conn, &folder).map_err(|e| e.to_string())?;
        folder_row.id
    };

    let files = library::scan_audio_files_recursive(&folder);
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        insert_placeholder_songs(&conn, added_folder_id, &files)?;
    }

    let songs = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let songs = SongRepo::get_all(&conn).map_err(|e| e.to_string())?;
        songs.iter().map(SongMetadata::from_db_song).collect()
    };

    let app_handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let db_state = app_handle.state::<DbState>();
        let result = scan_library_internal(db_state, app_handle.clone(), true, Some(added_folder_id)).await;
        if result.is_ok() {
            let _ = app_handle.emit(
                "library_scan_complete",
                ScanCompletePayload {
                    folder_id: added_folder_id,
                },
            );
        }
    });

    Ok(songs)
}

/// 移除文件夹
#[tauri::command]
pub fn remove_library_folder(
    db: State<'_, DbState>,
    folder: String,
) -> Result<Vec<LibraryFolder>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    FolderRepo::remove(&conn, &folder).map_err(|e| e.to_string())?;
    let folders = FolderRepo::get_all(&conn).map_err(|e| e.to_string())?;
    Ok(folders)
}

/// 扫描整个库（返回所有歌曲的元数据）
#[tauri::command]
pub async fn scan_library(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    force_restore: bool,
) -> Result<Vec<SongMetadata>, String> {
    scan_library_internal(db, app_handle, force_restore, None).await
}

/// 获取库中所有缓存的歌曲（不重新扫描）
#[tauri::command]
pub fn get_library_songs(db: State<'_, DbState>) -> Result<Vec<SongMetadata>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let songs = SongRepo::get_all(&conn).map_err(|e| e.to_string())?;
    Ok(songs.iter().map(SongMetadata::from_db_song).collect())
}

/// 获取所有已归档歌曲
#[tauri::command]
#[allow(dead_code)]
pub fn get_archived_songs(db: State<'_, DbState>) -> Result<Vec<SongMetadata>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let songs = SongRepo::get_archived(&conn).map_err(|e| e.to_string())?;
    Ok(songs.iter().map(SongMetadata::from_db_song).collect())
}

/// 强制刷新库（重新扫描，保持归档状态）
#[tauri::command]
pub async fn refresh_library(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<SongMetadata>, String> {
    // 直接扫描，force_restore = false (尊重归档)
    scan_library(db, app_handle, false).await
}

/// 从库中删除单首歌曲（同时清理收藏、播放列表关联等状态）
#[tauri::command]
pub fn delete_song(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    SongRepo::delete(&conn, id).map_err(|e| e.to_string())?;
    Ok(())
}

/// 恢复已归档的歌曲
#[tauri::command]
#[allow(dead_code)]
pub fn restore_song(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    SongRepo::restore(&conn, id).map_err(|e| e.to_string())?;
    Ok(())
}

/// 批量删除歌曲（同时清理收藏、播放列表关联等状态）
#[tauri::command]
pub fn batch_delete_songs(db: State<'_, DbState>, ids: Vec<i64>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    SongRepo::batch_delete(&conn, &ids).map_err(|e| e.to_string())?;
    Ok(())
}

/// 搜索歌曲
#[tauri::command]
pub fn search_library(db: State<'_, DbState>, query: String) -> Result<Vec<SongMetadata>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let songs = SongRepo::search(&conn, &query).map_err(|e| e.to_string())?;
    Ok(songs.iter().map(SongMetadata::from_db_song).collect())
}

/// 切换收藏状态
#[tauri::command]
pub fn toggle_favorite(db: State<'_, DbState>, song_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    SongRepo::toggle_favorite(&conn, song_id).map_err(|e| e.to_string())
}

/// 批量设置收藏状态
#[tauri::command]
pub fn batch_toggle_favorite(
    db: State<'_, DbState>,
    ids: Vec<i64>,
    is_favorite: bool,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    SongRepo::batch_set_favorite(&conn, &ids, is_favorite).map_err(|e| e.to_string())
}

/// 获取所有收藏的歌曲
#[tauri::command]
pub fn get_favorites(
    db: State<'_, DbState>,
    sort_order: Option<String>,
) -> Result<Vec<SongMetadata>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let order = sort_order.as_deref().unwrap_or("asc");
    let songs = SongRepo::get_favorites(&conn, order).map_err(|e| e.to_string())?;
    Ok(songs.iter().map(SongMetadata::from_db_song).collect())
}

/// 更新播放次数
#[tauri::command]
pub fn increment_play_count(db: State<'_, DbState>, song_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    SongRepo::increment_play_count(&conn, song_id).map_err(|e| e.to_string())
}
