use crate::DbState;
use crate::modules::database::{FolderRepo, LibraryFolder, SongRepo};
use crate::modules::library::{self, SongMetadata};
use crate::utils::path::normalize_folder_path;
use crate::utils::paths::{is_app_relative_path, is_user_file_path};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
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

struct SongWorkItem {
    path: String,
    folder_id: i64,
    existing_id: Option<i64>,
    should_restore: bool,
    is_new: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum MetadataRefreshMode {
    Incremental,
    ForceReextract,
}

struct SongWorkResult {
    item: SongWorkItem,
    meta: Option<SongMetadata>,
}

#[derive(Deserialize)]
pub struct UpdateSongDetailsRequest {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub track_number: Option<i32>,
    pub track_total: Option<i32>,
    pub disc_number: Option<i32>,
    pub disc_total: Option<i32>,
    pub lyrics_text: Option<String>,
    pub lyrics_source_path: Option<String>,
}

fn clean_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 判断 `child` 是否是 `parent` 的子路径（要求两端都已经过 `normalize_folder_path` 处理）。
/// 不依赖文件系统，仅按字符串前缀比较，对 Windows 盘符做大小写不敏感处理。
fn is_subpath_of(child: &str, parent: &str) -> bool {
    if child.len() <= parent.len() {
        return false;
    }

    // Byte indexing into a UTF-8 path can split non-ASCII folder names. Check the
    // separator first, then read the prefix only through `str::get`.
    if child.as_bytes().get(parent.len()) != Some(&b'/') {
        return false;
    }

    let Some(c_head) = child.get(..parent.len()) else {
        return false;
    };
    let p_head = parent;
    let head_match = if cfg!(windows) {
        c_head.eq_ignore_ascii_case(p_head)
    } else {
        c_head == p_head
    };
    head_match
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
    refresh_mode: MetadataRefreshMode,
) -> Result<Vec<SongMetadata>, String> {
    let app_cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?;

    let (folders, ignored_dirs): (Vec<_>, Vec<String>) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let all_folders = FolderRepo::get_by_type(&conn, "music").map_err(|e| e.to_string())?;
        let folders = if let Some(folder_id) = restore_folder_id {
            all_folders
                .into_iter()
                .filter(|f| f.id == folder_id)
                .collect()
        } else {
            all_folders
        };
        (folders, load_music_ignored_dirs(&conn))
    };
    let mut all_songs = Vec::new();

    for folder in folders {
        let files = library::scan_audio_files_recursive(&folder.path, &ignored_dirs);
        let mut work_items: Vec<SongWorkItem> = Vec::new();

        {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let stale_songs = SongRepo::get_songs_not_in_paths(&conn, folder.id, &files)
                .map_err(|e| e.to_string())?;
            for stale in stale_songs {
                if stale.status != "archived" {
                    let _ = SongRepo::archive(&conn, stale.id);
                }
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

                    if refresh_mode == MetadataRefreshMode::ForceReextract {
                        work_items.push(SongWorkItem {
                            path: file,
                            folder_id: folder.id,
                            existing_id: Some(existing.id),
                            should_restore: false,
                            is_new: false,
                        });
                        continue;
                    }

                    // 检查是否为占位符数据（Artist 或 Album 为 Unknown）
                    let is_placeholder =
                        existing.artist == "Unknown" || existing.album == "Unknown";

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

        let results =
            process_song_metadata_parallel(&app_handle, &app_cache_dir, folder.id, work_items);

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

                        if let Ok(Some(inserted)) = SongRepo::get_by_path(&conn, &result.item.path)
                        {
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
    let folder = normalize_folder_path(&folder);

    let added_folder_id = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;

        // 检查嵌套关系：当前已有的 music 文件夹中是否有此目录的祖先或后代
        let existing = FolderRepo::get_by_type(&conn, "music").map_err(|e| e.to_string())?;
        for f in &existing {
            if f.path == folder {
                // 已存在同一目录，直接返回当前歌曲列表
                let songs = SongRepo::get_all(&conn).map_err(|e| e.to_string())?;
                return Ok(songs.iter().map(SongMetadata::from_db_song).collect());
            }
            if is_subpath_of(&folder, &f.path) {
                return Err(format!("该目录已被父目录覆盖：{}", f.path));
            }
            if is_subpath_of(&f.path, &folder) {
                return Err(format!(
                    "已存在子目录 {}，请先在音乐库中移除该子目录后再添加父目录",
                    f.path
                ));
            }
        }

        let folder_row = FolderRepo::add(&conn, &folder).map_err(|e| e.to_string())?;
        folder_row.id
    };

    let ignored_dirs = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        load_music_ignored_dirs(&conn)
    };
    let files = library::scan_audio_files_recursive(&folder, &ignored_dirs);
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
        let result = scan_library_internal(
            db_state,
            app_handle.clone(),
            true,
            Some(added_folder_id),
            MetadataRefreshMode::Incremental,
        )
        .await;
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
    let removed = FolderRepo::remove(&conn, &folder).map_err(|e| e.to_string())?;
    if !removed {
        return Err(format!("未找到文件夹记录：{}", folder));
    }
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
    scan_library_internal(
        db,
        app_handle,
        force_restore,
        None,
        MetadataRefreshMode::Incremental,
    )
    .await
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
    let songs = scan_library_internal(
        db,
        app_handle.clone(),
        false,
        None,
        MetadataRefreshMode::ForceReextract,
    )
    .await?;

    let _ = app_handle.emit(
        "library_scan_complete",
        ScanCompletePayload { folder_id: 0 },
    );

    Ok(songs)
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

/// 更新歌曲信息和播放器内自定义歌词
#[tauri::command]
pub fn update_song_details(
    db: State<'_, DbState>,
    request: UpdateSongDetailsRequest,
) -> Result<SongMetadata, String> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err("标题不能为空".to_string());
    }

    let artist = request.artist.trim();
    let album = request.album.trim();
    let album_artist = clean_optional_string(request.album_artist);
    let genre = clean_optional_string(request.genre);
    let lyrics_text = clean_optional_string(request.lyrics_text);
    let lyrics_source_path = if lyrics_text.is_some() {
        clean_optional_string(request.lyrics_source_path)
    } else {
        None
    };

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    SongRepo::update_details(
        &conn,
        request.id,
        title,
        artist,
        album,
        album_artist.as_deref(),
        request.year,
        genre.as_deref(),
        request.track_number,
        request.track_total,
        request.disc_number,
        request.disc_total,
        lyrics_text.as_deref(),
        lyrics_source_path.as_deref(),
    )
    .map_err(|e| e.to_string())?;

    let updated = SongRepo::get_by_id(&conn, request.id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "未找到歌曲".to_string())?;
    Ok(SongMetadata::from_db_song(&updated))
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

const LEGACY_IGNORED_DIRS_KEY: &str = "library.ignored_dirs";
const COMMON_IGNORED_DIRS_KEY: &str = "library.ignored_dirs.common";
const MUSIC_IGNORED_DIRS_KEY: &str = "library.ignored_dirs.music";
const VIDEO_IGNORED_DIRS_KEY: &str = "library.ignored_dirs.video";
const DEFAULT_IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "build",
    ".gradle",
    "__pycache__",
    "venv",
    ".venv",
    "dist",
];

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScopedIgnoredDirNames {
    pub common: Vec<String>,
    pub music: Vec<String>,
    pub video: Vec<String>,
}

fn default_ignored_dirs() -> Vec<String> {
    DEFAULT_IGNORED_DIRS.iter().map(|s| s.to_string()).collect()
}

fn clean_ignored_names(names: Vec<String>) -> Vec<String> {
    let mut cleaned: Vec<String> = Vec::new();
    for name in names {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            continue;
        }
        if cleaned
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(trimmed))
        {
            continue;
        }
        cleaned.push(trimmed.to_string());
    }
    cleaned
}

fn load_ignored_dirs_by_key(conn: &Connection, key: &str, fallback: Vec<String>) -> Vec<String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok();
    match raw {
        Some(s) => serde_json::from_str::<Vec<String>>(&s)
            .map(clean_ignored_names)
            .unwrap_or(fallback),
        None => fallback,
    }
}

fn load_common_ignored_dirs(conn: &Connection) -> Vec<String> {
    let legacy = load_ignored_dirs_by_key(conn, LEGACY_IGNORED_DIRS_KEY, default_ignored_dirs());
    load_ignored_dirs_by_key(conn, COMMON_IGNORED_DIRS_KEY, legacy)
}

fn combine_ignored_dirs(common: Vec<String>, scoped: Vec<String>) -> Vec<String> {
    clean_ignored_names(common.into_iter().chain(scoped).collect())
}

fn save_ignored_dirs_by_key(conn: &Connection, key: &str, names: &[String]) -> Result<(), String> {
    let json = serde_json::to_string(names).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()",
        params![key, json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn load_music_ignored_dirs(conn: &Connection) -> Vec<String> {
    combine_ignored_dirs(
        load_common_ignored_dirs(conn),
        load_ignored_dirs_by_key(conn, MUSIC_IGNORED_DIRS_KEY, Vec::new()),
    )
}

pub(crate) fn load_video_ignored_dirs(conn: &Connection) -> Vec<String> {
    combine_ignored_dirs(
        load_common_ignored_dirs(conn),
        load_ignored_dirs_by_key(conn, VIDEO_IGNORED_DIRS_KEY, Vec::new()),
    )
}

fn load_scoped_ignored_dirs(conn: &Connection) -> ScopedIgnoredDirNames {
    ScopedIgnoredDirNames {
        common: load_common_ignored_dirs(conn),
        music: load_ignored_dirs_by_key(conn, MUSIC_IGNORED_DIRS_KEY, Vec::new()),
        video: load_ignored_dirs_by_key(conn, VIDEO_IGNORED_DIRS_KEY, Vec::new()),
    }
}

/// 获取扫描时忽略的目录名列表（首次读取时返回内置默认值）。
#[tauri::command]
pub fn get_ignored_dir_names(db: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    Ok(load_music_ignored_dirs(&conn))
}

/// 设置扫描时忽略的目录名列表。
#[tauri::command]
pub fn set_ignored_dir_names(
    db: State<'_, DbState>,
    names: Vec<String>,
) -> Result<Vec<String>, String> {
    let cleaned = clean_ignored_names(names);
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    save_ignored_dirs_by_key(&conn, COMMON_IGNORED_DIRS_KEY, &cleaned)?;
    Ok(cleaned)
}

#[tauri::command]
pub fn get_scoped_ignored_dir_names(
    db: State<'_, DbState>,
) -> Result<ScopedIgnoredDirNames, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    Ok(load_scoped_ignored_dirs(&conn))
}

#[tauri::command]
pub fn set_scoped_ignored_dir_names(
    db: State<'_, DbState>,
    names: ScopedIgnoredDirNames,
) -> Result<ScopedIgnoredDirNames, String> {
    let cleaned = ScopedIgnoredDirNames {
        common: clean_ignored_names(names.common),
        music: clean_ignored_names(names.music),
        video: clean_ignored_names(names.video),
    };
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    save_ignored_dirs_by_key(&conn, COMMON_IGNORED_DIRS_KEY, &cleaned.common)?;
    save_ignored_dirs_by_key(&conn, MUSIC_IGNORED_DIRS_KEY, &cleaned.music)?;
    save_ignored_dirs_by_key(&conn, VIDEO_IGNORED_DIRS_KEY, &cleaned.video)?;
    Ok(cleaned)
}

#[derive(Serialize)]
pub struct DebugSongRow {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub folder_id: Option<i64>,
    pub status: String,
    pub created_at: Option<String>,
}

/// 排查命令：返回 path/title 中含有指定关键字的所有歌曲（任意状态），用于定位"莫名出现的"条目。
#[tauri::command]
pub fn debug_dump_test_songs(
    db: State<'_, DbState>,
    keyword: Option<String>,
) -> Result<Vec<DebugSongRow>, String> {
    let kw = keyword.unwrap_or_else(|| "test".to_string());
    let pattern = format!("%{}%", kw);
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, path, title, artist, album, folder_id, status, created_at
             FROM songs
             WHERE path LIKE ?1 OR title LIKE ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&pattern], |row| {
            Ok(DebugSongRow {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                folder_id: row.get(5)?,
                status: row
                    .get::<_, Option<String>>(6)?
                    .unwrap_or_else(|| "active".to_string()),
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}
