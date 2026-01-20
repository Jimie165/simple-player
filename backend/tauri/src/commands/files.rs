use crate::modules::library::{self, SongMetadata};
use std::path::Path;

#[tauri::command]
pub fn get_metadata(path: String) -> Result<SongMetadata, String> {
    library::get_metadata(&path)
}

/// 读取文件夹内的所有音频文件路径
#[tauri::command]
pub fn read_folder_audio_files(folder: String) -> Vec<SongMetadata> {
    let paths = library::scan_audio_files(&folder);
    let mut songs = Vec::new();

    for path in paths {
        if let Ok(meta) = library::get_metadata(&path) {
            songs.push(meta);
        } else {
            // 如果解析失败，生成简易 metadata
            let p = Path::new(&path);
            let filename = p
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string();
            songs.push(SongMetadata {
                id: None,
                title: filename,
                artist: "Unknown".to_string(),
                album: "Unknown".to_string(),
                duration: 0,
                cover: None,
                cover_path: None,
                path: Some(path.replace('\\', "/")),
                size: None,
                sample_rate: None,
                bitrate: None,
                album_artist: None,
                year: None,
                genre: None,
                track_number: None,
                track_total: None,
                disc_number: None,
                disc_total: None,
                play_count: None,
                last_played_at: None,
                is_favorite: None,
                rating: None,
            });
        }
    }
    songs
}
