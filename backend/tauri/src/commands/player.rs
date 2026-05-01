use crate::modules::library::LyricsData;
use crate::modules::library::SongMetadata;
use crate::modules::player::{AudioOutputInfo, AudioOutputState, AudioState};
use tauri::State;

#[tauri::command]
pub fn play_audio(
    state: State<'_, AudioState>,
    path: String,
    metadata: Option<SongMetadata>,
) -> Result<(), String> {
    state.play_file(path, metadata)
}

#[tauri::command]
pub fn load_audio(
    state: State<'_, AudioState>,
    path: String,
    metadata: Option<SongMetadata>,
) -> Result<(), String> {
    state.load_file(path, metadata)
}

#[tauri::command]
pub fn pause_audio(state: State<'_, AudioState>) {
    state.pause();
}

#[tauri::command]
pub fn resume_audio(state: State<'_, AudioState>) {
    state.resume();
}

#[tauri::command]
pub fn seek_audio(state: State<'_, AudioState>, position: f32) -> Result<f32, String> {
    state.seek(position)
}

#[tauri::command]
pub fn set_volume(state: State<'_, AudioState>, volume: f32) {
    state.set_volume(volume);
}

#[tauri::command]
pub fn get_audio_position(state: State<'_, AudioState>) -> Result<f32, String> {
    state.get_position()
}

#[tauri::command]
pub fn get_lyrics(path: String) -> Result<LyricsData, String> {
    crate::modules::library::get_lyrics(&path)
}

#[tauri::command]
pub fn list_audio_outputs(state: State<'_, AudioState>) -> Result<Vec<AudioOutputInfo>, String> {
    state.list_outputs()
}

#[tauri::command]
pub fn get_audio_output(state: State<'_, AudioState>) -> AudioOutputState {
    state.get_output_state()
}

#[tauri::command]
pub fn set_audio_output(
    state: State<'_, AudioState>,
    device: Option<String>,
) -> Result<(), String> {
    state.set_output_preference(device)
}
