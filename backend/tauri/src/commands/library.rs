use crate::metadata::{self, SongMetadata};
use crate::utils::config::{self};
use crate::utils::file_scanner;
use tauri::AppHandle;

// 获取所有已保存的文件夹
#[tauri::command]
pub fn get_library_folders(app: AppHandle) -> Vec<String> {
    let config = config::load_config(&app);
    config.library_folders
}

// 添加文件夹到库
#[tauri::command]
pub fn add_library_folder(app: AppHandle, folder: String) -> Result<Vec<String>, String> {
    let mut config = config::load_config(&app);
    if !config.library_folders.contains(&folder) {
        config.library_folders.push(folder);
        config::save_config(&app, &config)?;
    }
    Ok(config.library_folders)
}

// 移除文件夹
#[tauri::command]
pub fn remove_library_folder(app: AppHandle, folder: String) -> Result<Vec<String>, String> {
    let mut config = config::load_config(&app);
    config.library_folders.retain(|f| f != &folder);
    config::save_config(&app, &config)?;
    Ok(config.library_folders)
}

// 扫描整个库 (返回所有歌曲的元数据)
// 注意：这可能会很慢，实际生产中应该做分页或异步流式传输，这里为了简单直接返回所有
#[tauri::command]
pub async fn scan_library(app: AppHandle) -> Result<Vec<SongMetadata>, String> {
    let config = config::load_config(&app);
    let mut all_songs = Vec::new();

    for folder in config.library_folders {
        // 复用之前的 file_scanner
        let files = file_scanner::scan_audio_files(&folder);
        for file in files {
            // 获取元数据
            // 注意：这里是串行读取，文件多了会慢。
            // 优化点：可以使用 rayon 进行并行读取
            if let Ok(meta) = metadata::get_metadata(&file) {
                all_songs.push(meta);
            }
        }
    }

    Ok(all_songs)
}
