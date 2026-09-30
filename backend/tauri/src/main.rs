#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod modules;
mod utils;

use modules::database;
use modules::player::AudioState;
use rusqlite::Connection;
use std::fs;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

/// 数据库状态，用于 Tauri 状态管理
pub struct DbState(pub Arc<Mutex<Connection>>);

fn main() {
    let audio_state = AudioState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(audio_state)
        .manage(modules::library::covers::SongArtworkState(Mutex::new(())))
        .setup(|app| {
            let directories = utils::paths::AppDirectories::initialize(app)?;
            let webview_directory = directories.cache.clone();
            app.manage(directories);
            // 初始化数据库
            let app_data_dir = crate::utils::paths::app_data_dir(app)?;
            let app_cache_dir = crate::utils::paths::app_cache_dir(app)?;

            // 迁移 Roaming/cache 到 Local/cache
            migrate_cache_from_roaming(&app_data_dir, &app_cache_dir);

            fs::create_dir_all(&app_data_dir)?;
            fs::create_dir_all(&app_cache_dir)?;

            // 后台补齐旧封面的列表缩略图，避免阻塞窗口首次显示。
            let thumbnail_app = app.handle().clone();
            let thumbnail_cache_dir = app_cache_dir.clone();
            std::thread::spawn(move || {
                modules::library::covers::ensure_cached_cover_thumbnails(&thumbnail_cache_dir);
                let _ = thumbnail_app.emit("cover-thumbnails-ready", ());
            });

            let db_path = app_data_dir.join("library.db");
            let conn = Connection::open(&db_path).expect("Failed to open database");

            // 初始化表结构（带迁移）
            database::init_schema(&conn).expect("Failed to initialize database schema");

            // 迁移旧的 JSON 配置（如果存在）
            migrate_old_config(app, &conn);

            // 注入数据库状态
            app.manage(DbState(Arc::new(Mutex::new(conn))));
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .data_directory(webview_directory)
                .build()?;
            let db = app.state::<DbState>().0.clone();
            modules::window_state::initialize(app, db);

            // 初始化 AudioState 的 AppHandle (用于未来的 SMTC 事件)
            let audio_state: tauri::State<AudioState> = app.state();
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let hwnd = window.hwnd().ok();
                    audio_state.init_with_app_handle(app.handle().clone(), hwnd);
                } else {
                    audio_state.init_with_app_handle(app.handle().clone(), None);
                }
            }

            #[cfg(not(target_os = "windows"))]
            audio_state.init_with_app_handle(app.handle().clone(), None);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Player commands
            commands::player::play_audio,
            commands::player::load_audio,
            commands::player::pause_audio,
            commands::player::resume_audio,
            commands::player::set_volume,
            commands::player::set_reactive_background_enabled,
            commands::player::seek_audio,
            commands::player::get_audio_position,
            commands::player::get_playback_snapshot,
            commands::player::get_lyrics,
            commands::player::get_raw_lyrics,
            commands::player::list_audio_outputs,
            commands::player::get_audio_output,
            commands::player::set_audio_output,
            // File commands
            commands::files::get_app_directories,
            commands::files::get_metadata,
            commands::files::get_original_metadata,
            commands::files::read_folder_audio_files,
            // Library commands
            commands::library::get_library_folders,
            commands::library::add_library_folder,
            commands::library::remove_library_folder,
            commands::library::scan_library,
            commands::library::get_library_songs,
            commands::library::refresh_library,
            commands::library::delete_song,
            commands::library::batch_delete_songs,
            commands::library::restore_excluded_songs,
            commands::library::update_song_details,
            commands::library::update_album_details,
            commands::library::search_library,
            commands::library::toggle_favorite,
            commands::library::batch_toggle_favorite,
            commands::library::get_favorites,
            commands::library::increment_play_count,
            commands::library::debug_dump_test_songs,
            commands::library::get_ignored_dir_names,
            commands::library::set_ignored_dir_names,
            commands::library::get_scoped_ignored_dir_names,
            commands::library::set_scoped_ignored_dir_names,
            // Playlist commands
            commands::playlist::get_playlists,
            commands::playlist::create_playlist,
            commands::playlist::delete_playlist,
            commands::playlist::rename_playlist,
            commands::playlist::add_to_playlist,
            commands::playlist::batch_add_to_playlist,
            commands::playlist::remove_from_playlist,
            commands::playlist::batch_remove_from_playlist,
            commands::playlist::batch_remove_playlist_items,
            commands::playlist::reorder_playlist_songs,
            commands::playlist::update_playlist_info,
            commands::playlist::update_playlist_cover,
            commands::playlist::get_playlist_songs,
            commands::playlist::get_playlist_cover_paths,
            commands::playlist::mark_playlist_as_played,
            // Queue commands
            commands::queue::save_play_queue,
            commands::queue::get_play_queue,
            commands::queue::clear_play_queue,
            // Video commands
            commands::video::scan::scan_videos,
            commands::video::scan::add_video_folder,
            commands::video::scan::restore_archived_videos,
            commands::video::scan::get_video_folders,
            commands::video::scan::remove_video_folder,
            commands::video::query::get_all_videos,
            commands::video::query::search_videos,
            commands::video::query::toggle_video_favorite,
            commands::video::query::batch_delete_videos,
            commands::video::prepare::prepare_video_for_playback,
            commands::video::cache::get_transcode_cache_info,
            commands::video::cache::clear_transcode_cache,
            commands::video::cache::set_transcode_cache_limit,
            commands::video::cache::set_transcode_cache_dir,
            // Debug commands
            commands::debug::get_path_debug_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 迁移旧的 JSON 配置到 SQLite
fn migrate_old_config(app: &tauri::App, conn: &Connection) {
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Default)]
    struct OldConfig {
        library_folders: Vec<String>,
    }

    let config_path = match crate::utils::paths::app_data_dir(app) {
        Ok(path) => path.join("library.json"),
        Err(_) => return,
    };

    if !config_path.exists() {
        return;
    }

    // 读取旧配置
    let content = match fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => return,
    };

    let old_config: OldConfig = match serde_json::from_str(&content) {
        Ok(c) => c,
        Err(_) => return,
    };

    // 迁移文件夹到数据库
    let count = old_config.library_folders.len();
    for folder in old_config.library_folders {
        let _ = database::FolderRepo::add(conn, &folder);
    }

    // 删除旧配置文件
    let _ = fs::remove_file(&config_path);

    println!("Migrated {} folders from old config", count);
}

/// 迁移 Roaming/cache 到 Local/cache
fn migrate_cache_from_roaming(roaming_dir: &std::path::Path, local_dir: &std::path::Path) {
    let roaming_cache = roaming_dir.join("cache");
    let local_cache = local_dir.join("cache");

    if roaming_cache.exists() {
        if !local_cache.exists() {
            // 目标不存在，直接移动整个目录
            // 确保父目录存在
            let _ = fs::create_dir_all(local_dir);
            match fs::rename(&roaming_cache, &local_cache) {
                Ok(_) => println!("Successfully migrated cache from Roaming to Local"),
                Err(e) => {
                    // 跨驱动器移动可能失败，尝试复制后删除
                    println!("Failed to rename cache folder (will try copy): {}", e);
                    // 简单实现：仅移动目录，需更完善的递归复制
                    // 在 Windows 上 AppData Roaming 和 Local 通常在同一驱动器，rename 应有效
                }
            }
        } else {
            // 目标已存在，尝试移动内容
            // 这是一个简单的迁移，暂不处理复杂的合并冲突
            println!("Local cache already exists, skipping full migration from Roaming");
            // 可选：遍历 roaming_cache 下的文件移过去
        }
    }
}
