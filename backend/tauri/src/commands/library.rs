use crate::modules::database::{FolderRepo, SongRepo, LibraryFolder};
use crate::modules::library::{self, SongMetadata};
use crate::DbState;
use std::path::Path;
use tauri::State;

/// 获取所有已保存的文件夹路径
#[tauri::command]
pub fn get_library_folders(db: State<'_, DbState>) -> Result<Vec<LibraryFolder>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let folders = FolderRepo::get_all(&conn).map_err(|e| e.to_string())?;
    Ok(folders)
}

/// 添加文件夹到库
#[tauri::command]
pub fn add_library_folder(db: State<'_, DbState>, folder: String) -> Result<Vec<LibraryFolder>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    FolderRepo::add(&conn, &folder).map_err(|e| e.to_string())?;
    let folders = FolderRepo::get_all(&conn).map_err(|e| e.to_string())?;
    Ok(folders)
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
/// 此命令会扫描所有库文件夹，并将元数据缓存到数据库
#[tauri::command]
pub async fn scan_library(db: State<'_, DbState>) -> Result<Vec<SongMetadata>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let folders = FolderRepo::get_all(&conn).map_err(|e| e.to_string())?;
    let mut all_songs = Vec::new();

    for folder in folders {
        // 扫描文件夹中的音频文件
        let files = library::scan_audio_files(&folder.path);
        
        // 清理已删除的文件
        let stale_songs = SongRepo::get_songs_not_in_paths(&conn, folder.id, &files)
            .map_err(|e| e.to_string())?;
        for stale in stale_songs {
            let _ = SongRepo::delete(&conn, stale.id);
        }

        for file in files {
            // 尝试从数据库获取缓存的元数据
            if let Ok(Some(cached)) = SongRepo::get_by_path(&conn, &file) {
                all_songs.push(SongMetadata::from_db_song(&cached));
                continue;
            }

            // 从文件读取元数据
            if let Ok(meta) = library::get_metadata(&file) {
                // 保存到数据库
                let _ = SongRepo::upsert(
                    &conn,
                    &file,
                    &meta.title,
                    &meta.artist,
                    &meta.album,
                    meta.duration as i64,
                    meta.cover.as_deref(),
                    Some(folder.id),
                );
                all_songs.push(meta);
            } else {
                // 解析失败，创建简易元数据
                let p = Path::new(&file);
                let filename = p
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string();
                
                let meta = SongMetadata {
                    id: None,
                    title: filename.clone(),
                    artist: "Unknown".to_string(),
                    album: "Unknown".to_string(),
                    duration: 0,
                    cover: None,
                    path: Some(file.clone()),
                    size: None,
                    sample_rate: None,
                    bitrate: None,
                };
                
                let _ = SongRepo::upsert(
                    &conn,
                    &file,
                    &filename,
                    "Unknown",
                    "Unknown",
                    0,
                    None,
                    Some(folder.id),
                );
                all_songs.push(meta);
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

/// 强制刷新库（清除缓存后重新扫描）
#[tauri::command]
pub async fn refresh_library(db: State<'_, DbState>) -> Result<Vec<SongMetadata>, String> {
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let folders = FolderRepo::get_all(&conn).map_err(|e| e.to_string())?;
        
        // 删除所有文件夹下的歌曲缓存
        for folder in folders {
            let _ = SongRepo::delete_by_folder(&conn, folder.id);
        }
    }
    
    // 重新扫描
    scan_library(db).await
}

/// 从库中移除单首歌曲
#[tauri::command]
pub fn delete_song(db: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    SongRepo::delete(&conn, id).map_err(|e| e.to_string())?;
    Ok(())
}
