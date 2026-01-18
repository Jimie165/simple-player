mod audio;
mod metadata;
mod smtc;
// 新增模块
mod commands;
mod utils;

use audio::AudioState;
use commands::{files, player}; // 引入拆分后的指令

fn main() {
    let audio_state = AudioState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(audio_state)
        .invoke_handler(tauri::generate_handler![
            // Player commands
            player::play_audio,
            player::pause_audio,
            player::resume_audio,
            player::set_volume,
            player::seek_audio,
            // File commands
            files::get_metadata,
            files::read_folder_audio_files,
            // Library commands
            commands::library::get_library_folders,
            commands::library::add_library_folder,
            commands::library::remove_library_folder,
            commands::library::scan_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
