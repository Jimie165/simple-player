use crate::DbState;
use crate::modules::database::SongRepo;
use crate::modules::library::video_scanner;
use crate::modules::library::video_thumbnails;
use crate::modules::library::{self, SongMetadata};
use crate::utils::path::normalize_db_path;
use std::path::Path;
use tauri::{Manager, State};

#[tauri::command]
pub fn get_metadata(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    path: String,
) -> Result<SongMetadata, String> {
    // 使用 app_cache_dir 以支持封面缓存 (Local)
    let app_cache_dir = app.path().app_cache_dir().ok();

    // 1. 优先尝试视频元数据 (Video Scanner)
    // 这样做是为了防止 MP4 等容器格式被音频库 (Lofty) 抢先解析，导致无法生成视频缩略图
    let mut meta = if let Ok(video_meta) = video_scanner::get_video_metadata(&path) {
        // 尝试生成视频缩略图
        let thumbnail_path = video_thumbnails::ensure_video_thumbnail(&app, &path)
            .ok()
            .flatten();

        SongMetadata {
            id: None,
            title: video_meta.title,
            artist: "".to_string(),
            album: "".to_string(),
            duration: video_meta.duration as u64,
            cover: None,
            cover_path: thumbnail_path,
            path: Some(normalize_db_path(std::path::Path::new(&video_meta.path))),
            size: Some(video_meta.size),
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
            width: video_meta.width,
            height: video_meta.height,
            frame_rate: video_meta.frame_rate,
            channels: video_meta.channels,
        }
    }
    // 2. 如果不是视频，尝试音频元数据 (Lofty / Library)
    else if let Ok(m) = library::get_metadata(&path, app_cache_dir.as_deref()) {
        m
    } else {
        return Err("Could not extract metadata from file".to_string());
    };

    // 2. 尝试从数据库获取 ID 和用户数据 (is_favorite, play_count 等)
    // 如果数据库中有此文件，应该优先使用数据库ID，这样才能进行播放列表操作
    if let Ok(conn) = state.0.lock() {
        let normalized_path = normalize_db_path(std::path::Path::new(&path));
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

/// 读取文件夹内的所有音频和视频文件路径
#[tauri::command]
pub fn read_folder_audio_files(app: tauri::AppHandle, folder: String) -> Vec<SongMetadata> {
    // 扫描音频文件
    let audio_paths = library::scan_audio_files(&folder);
    // 扫描视频文件
    let video_paths = video_scanner::scan_video_files_recursive(&folder, &[]);

    // 合并路径列表并去重
    let mut all_paths: Vec<String> = audio_paths;
    for video_path in video_paths {
        if !all_paths.contains(&video_path) {
            all_paths.push(video_path);
        }
    }
    all_paths.sort();

    let mut songs = Vec::new();
    let app_cache_dir = app.path().app_cache_dir().ok();

    for path in all_paths {
        // 1. 视频优先 (Video Scanner)
        if let Ok(video_meta) = video_scanner::get_video_metadata(&path) {
            // 生成缩略图
            let thumbnail_path = video_thumbnails::ensure_video_thumbnail(&app, &path)
                .ok()
                .flatten();
            songs.push(SongMetadata {
                id: None,
                title: video_meta.title,
                artist: "".to_string(),
                album: "".to_string(),
                duration: video_meta.duration as u64,
                cover: None,
                cover_path: thumbnail_path,
                path: Some(normalize_db_path(std::path::Path::new(&video_meta.path))),
                size: Some(video_meta.size),
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
                width: video_meta.width,
                height: video_meta.height,
                frame_rate: video_meta.frame_rate,
                channels: video_meta.channels,
            });
        }
        // 2. 音频次之 (Lofty Audio Library)
        else if let Ok(meta) = library::get_metadata(&path, app_cache_dir.as_deref()) {
            songs.push(meta);
        } else {
            // 如果都失败，生成简易 metadata
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
                path: Some(normalize_db_path(&std::path::Path::new(&path))),
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
                width: None,
                height: None,
                frame_rate: None,
                channels: None,
            });
        }
    }
    songs
}
