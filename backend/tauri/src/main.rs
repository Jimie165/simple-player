mod audio;
mod metadata;
mod smtc;

use audio::AudioState;
use metadata::SongMetadata;
use tauri::State;

#[tauri::command]
#[allow(dead_code)]
fn get_metadata(path: String) -> Result<SongMetadata, String> {
    metadata::get_metadata(&path)
}

// 新增：跳转进度指令
#[tauri::command]
#[allow(dead_code)]
fn seek_audio(state: State<'_, AudioState>, position: f32) -> Result<(), String> {
    state.seek(position)
}

#[tauri::command]
fn play_audio(
    state: State<'_, AudioState>,
    path: String,
    metadata: Option<SongMetadata>, // 新增参数
) -> Result<(), String> {
    state.play_file(path, metadata)
}

#[tauri::command]
fn pause_audio(state: State<'_, AudioState>) {
    state.pause();
}

#[tauri::command]
fn resume_audio(state: State<'_, AudioState>) {
    state.resume();
}

#[tauri::command]
fn set_volume(state: State<'_, AudioState>, volume: f32) {
    state.set_volume(volume);
}

fn main() {
    let audio_state = AudioState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(audio_state)
        .invoke_handler(tauri::generate_handler![
            get_metadata,
            play_audio,
            pause_audio,
            resume_audio,
            set_volume,
            seek_audio
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
