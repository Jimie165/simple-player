use crate::modules::library::{self, SongMetadata};
use crate::modules::database::SongRepo;
use crate::DbState;
use std::path::Path;
use tauri::{Manager, State};

#[tauri::command]
pub fn get_metadata(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    path: String,
) -> Result<SongMetadata, String> {
    // 尝试获取 app_data_dir 以支持缓存
    let app_data_dir = app.path().app_data_dir().ok();
    
    // 1. 从文件读取基础元数据
    let mut meta = library::get_metadata(&path, app_data_dir.as_deref())?;

    // 2. 尝试从数据库获取 ID 和用户数据 (is_favorite, play_count 等)
    // 如果数据库中有此文件，应该优先使用数据库ID，这样才能进行播放列表操作
    if let Ok(conn) = state.0.lock() {
        let normalized_path = path.replace('\\', "/");
        // Try exact match first, then normalized
        let db_result = SongRepo::get_by_path(&conn, &path)
            .or_else(|_| SongRepo::get_by_path(&conn, &normalized_path));

        if let Ok(Some(db_song)) = db_result {
            // Merge DB info
            meta.id = Some(db_song.id);
            meta.is_favorite = Some(db_song.is_favorite);
            meta.play_count = Some(db_song.play_count);
            meta.last_played_at = db_song.last_played_at;
            meta.rating = db_song.rating;
            // 可以根据需要合并更多字段，但 ID 是最关键的
        }
    }

    Ok(meta)
}

/// 读取文件夹内的所有音频文件路径
#[tauri::command]
pub fn read_folder_audio_files(app: tauri::AppHandle, folder: String) -> Vec<SongMetadata> {
    let paths = library::scan_audio_files(&folder);
    let mut songs = Vec::new();
    let app_data_dir = app.path().app_data_dir().ok();

    for path in paths {
        if let Ok(meta) = library::get_metadata(&path, app_data_dir.as_deref()) {
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
                unique_id: None,
            });
        }
    }
    songs
}
