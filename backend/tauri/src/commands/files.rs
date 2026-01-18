use crate::metadata::{self, SongMetadata};
use crate::utils::file_scanner;
use std::path::Path;

#[tauri::command]
pub fn get_metadata(path: String) -> Result<SongMetadata, String> {
    metadata::get_metadata(&path)
}

// 新增：读取文件夹内的所有音频文件路径
#[tauri::command]
pub fn read_folder_audio_files(folder: String) -> Vec<SongMetadata> {
    let paths = file_scanner::scan_audio_files(&folder);
    let mut songs = Vec::new();

    for path in paths {
        // 解析元数据
        if let Ok(meta) = metadata::get_metadata(&path) {
            songs.push(meta);
        } else {
            // 如果解析失败，也可以由 path 生成一个简易的 metadata，防止文件丢失
            let p = Path::new(&path);
            let filename = p
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string();
            songs.push(SongMetadata {
                title: filename,
                artist: "Unknown".to_string(),
                album: "Unknown".to_string(),
                duration: 0,
                cover: None,
                path: Some(path.replace('\\', "/")),
            });
        }
    }
    songs
}
