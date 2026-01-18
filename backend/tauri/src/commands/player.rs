use crate::audio::AudioState;
use crate::metadata::SongMetadata;
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
pub fn pause_audio(state: State<'_, AudioState>) {
    state.pause();
}

#[tauri::command]
pub fn resume_audio(state: State<'_, AudioState>) {
    state.resume();
}

#[tauri::command]
pub fn seek_audio(state: State<'_, AudioState>, position: f32) -> Result<(), String> {
    state.seek(position)
}

#[tauri::command]
pub fn set_volume(state: State<'_, AudioState>, volume: f32) {
    state.set_volume(volume);
}
