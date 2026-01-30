use crate::DbState;
use crate::modules::database::{FolderRepo, LibraryFolder, SongRepo};
use crate::modules::library::{self, SongMetadata, save_cover};
use std::path::Path;
use tauri::{Manager, State};

async fn scan_library_internal(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    force_restore: bool,
    restore_folder_id: Option<i64>,
) -> Result<Vec<SongMetadata>, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let folders = FolderRepo::get_all(&conn).map_err(|e| e.to_string())?;
    let mut all_songs = Vec::new();

    for folder in folders {
        let files = library::scan_audio_files_recursive(&folder.path);

        let stale_songs = SongRepo::get_songs_not_in_paths(&conn, folder.id, &files)
            .map_err(|e| e.to_string())?;
        for stale in stale_songs {
            let _ = SongRepo::hard_delete(&conn, stale.id);
        }

        for file in files {
            if let Ok(Some(existing)) = SongRepo::get_by_path_any_status(&conn, &file) {
                if existing.status == "archived" {
                    let should_restore = force_restore
                        && restore_folder_id
                            .map(|target| existing.folder_id == Some(target))
                            .unwrap_or(true);

                    if should_restore {
                        if let Ok(meta) = library::get_metadata(&file, Some(&app_data_dir)) {
                            let cover_path = meta.cover_path.clone().or_else(|| {
                                meta.cover.as_ref().and_then(|cover_data| {
                                    save_cover(&app_data_dir, &meta.album, &meta.artist, cover_data)
                                })
                            });

                            let _ = SongRepo::update_metadata(
                                &conn,
                                existing.id,
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
                            let _ = SongRepo::restore(&conn, existing.id);

                            if let Ok(Some(updated)) = SongRepo::get_by_path(&conn, &file) {
                                all_songs.push(SongMetadata::from_db_song(&updated));
                            }
                        }
                    } else {
                        continue;
                    }
                } else {
                    all_songs.push(SongMetadata::from_db_song(&existing));
                }
                continue;
            }

            if let Ok(meta) = library::get_metadata(&file, Some(&app_data_dir)) {
                let cover_path = meta.cover_path.clone().or_else(|| {
                    meta.cover.as_ref().and_then(|cover_data| {
                        save_cover(&app_data_dir, &meta.album, &meta.artist, cover_data)
                    })
                });

                let _ = SongRepo::upsert(
                    &conn,
                    &file,
                    &meta.title,
                    &meta.artist,
                    &meta.album,
                    meta.duration as i64,
                    None,
                    cover_path.as_deref(),
                    Some(folder.id),
                    meta.album_artist.as_deref(),
                    meta.year,
                    meta.genre.as_deref(),
                    meta.track_number,
                    meta.track_total,
                    meta.disc_number,
                    meta.disc_total,
                );

                if let Ok(Some(inserted)) = SongRepo::get_by_path(&conn, &file) {
                    all_songs.push(SongMetadata::from_db_song(&inserted));
                } else {
                    let mut result_meta = meta.clone();
                    result_meta.cover_path = cover_path;
                    result_meta.cover = None;
                    all_songs.push(result_meta);
                }
            } else {
                let p = Path::new(&file);
                let filename = p
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string();

                let _ = SongRepo::upsert(
                    &conn,
                    &file,
                    &filename,
                    "Unknown",
                    "Unknown",
                    0,
                    None,
                    None,
                    Some(folder.id),
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                );

                if let Ok(Some(inserted)) = SongRepo::get_by_path(&conn, &file) {
                    all_songs.push(SongMetadata::from_db_song(&inserted));
                }
            }
        }
    }

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

    // 添加后立即扫描：仅恢复该文件夹内已归档歌曲
    scan_library_internal(db, app_handle, true, Some(added_folder_id)).await
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

/// 从库中移除单首歌曲（归档）
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

/// 批量删除歌曲（归档）
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
