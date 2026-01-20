use crate::modules::database::{FolderRepo, SongRepo, LibraryFolder};
use crate::modules::library::{self, SongMetadata, save_cover};
use crate::DbState;
use std::path::Path;
use tauri::{Manager, State};

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
    folder: String
) -> Result<Vec<SongMetadata>, String> {
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        FolderRepo::add(&conn, &folder).map_err(|e| e.to_string())?;
    }
    
    // 添加后立即扫描，强制恢复已归档歌曲
    scan_library(db, app_handle, true).await
}

/// 移除文件夹
#[tauri::command]
pub fn remove_library_folder(db: State<'_, DbState>, folder: String) -> Result<Vec<LibraryFolder>, String> {
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
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let folders = FolderRepo::get_all(&conn).map_err(|e| e.to_string())?;
    let mut all_songs = Vec::new();

    for folder in folders {
        // 使用递归扫描文件夹中的音频文件
        let files = library::scan_audio_files_recursive(&folder.path);
        
        // 清理已删除的文件（数据库中有但磁盘上没有）
        // 无论是否归档，只要文件不存在了，就硬删除
        let stale_songs = SongRepo::get_songs_not_in_paths(&conn, folder.id, &files)
            .map_err(|e| e.to_string())?;
        for stale in stale_songs {
            let _ = SongRepo::hard_delete(&conn, stale.id);
        }

        for file in files {
            // 尝试从数据库获取缓存的元数据 (查任意状态)
            if let Ok(Some(existing)) = SongRepo::get_by_path_any_status(&conn, &file) {
                if existing.status == "archived" {
                    if force_restore {
                        // 场景 B: 强制恢复 (读取新元数据 + 设为 active)
                         if let Ok(meta) = library::get_metadata(&file) {
                             // 保存封面
                             let cover_path = meta.cover.as_ref().and_then(|cover_data| {
                                 save_cover(&app_data_dir, &meta.album, &meta.artist, cover_data)
                             });
                             
                             // 更新元数据
                             let _ = SongRepo::update_metadata(
                                &conn, existing.id, &meta.title, &meta.artist, &meta.album,
                                meta.duration as i64, None, cover_path.as_deref(),
                                meta.album_artist.as_deref(), meta.year, meta.genre.as_deref(),
                                meta.track_number, meta.track_total, meta.disc_number, meta.disc_total
                             );
                             // 设为活跃
                             let _ = SongRepo::restore(&conn, existing.id);
                             
                             // 返回更新后的数据
                             if let Ok(Some(updated)) = SongRepo::get_by_path(&conn, &file) {
                                all_songs.push(SongMetadata::from_db_song(&updated));
                             }
                         }
                    } else {
                        // 场景 A: 刷新 (保持归档，跳过)
                        continue;
                    }
                } else {
                    // 活跃歌曲，直接返回缓存
                    all_songs.push(SongMetadata::from_db_song(&existing));
                }
                continue;
            }

            // 从文件读取元数据
            if let Ok(meta) = library::get_metadata(&file) {
                // 保存封面到文件
                let cover_path = meta.cover.as_ref().and_then(|cover_data| {
                    save_cover(&app_data_dir, &meta.album, &meta.artist, cover_data)
                });

                // 保存到数据库
                let _ = SongRepo::upsert(
                    &conn,
                    &file,
                    &meta.title,
                    &meta.artist,
                    &meta.album,
                    meta.duration as i64,
                    None, // 不再存储 base64 cover
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
                
                // 重新从数据库获取，以确保有正确的 ID
                if let Ok(Some(inserted)) = SongRepo::get_by_path(&conn, &file) {
                    all_songs.push(SongMetadata::from_db_song(&inserted));
                } else {
                    // Fallback (不应该发生)
                    let mut result_meta = meta.clone();
                    result_meta.cover_path = cover_path;
                    result_meta.cover = None;
                    all_songs.push(result_meta);
                }
            } else {
                // 解析失败，创建简易元数据
                let p = Path::new(&file);
                let filename = p
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string();
                
                // 简易 Upsert 如果存在则不更新 status
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
                    None, None, None, None, None, None, None,
                );
                
                // 重新从数据库获取
                if let Ok(Some(inserted)) = SongRepo::get_by_path(&conn, &file) {
                    all_songs.push(SongMetadata::from_db_song(&inserted));
                }
            }
        }
    }
    
    Ok(all_songs)
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
pub fn get_favorites(db: State<'_, DbState>) -> Result<Vec<SongMetadata>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let songs = SongRepo::get_favorites(&conn).map_err(|e| e.to_string())?;
    Ok(songs.iter().map(SongMetadata::from_db_song).collect())
}

/// 更新播放次数
#[tauri::command]
pub fn increment_play_count(db: State<'_, DbState>, song_id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    SongRepo::increment_play_count(&conn, song_id).map_err(|e| e.to_string())
}
