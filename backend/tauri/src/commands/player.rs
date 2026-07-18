use crate::modules::database::SongRepo;
use crate::modules::library::LyricsData;
use crate::modules::library::SongMetadata;
use crate::modules::player::{AudioOutputInfo, AudioOutputState, AudioState};
use crate::utils::path::normalize_db_path;
use crate::DbState;
use std::path::Path;
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
pub fn set_reactive_background_enabled(state: State<'_, AudioState>, enabled: bool) {
    state.set_reactive_background_enabled(enabled);
}

#[tauri::command]
pub fn get_audio_position(state: State<'_, AudioState>) -> Result<f32, String> {
    state.get_position()
}

#[tauri::command]
pub fn get_lyrics(db: State<'_, DbState>, path: String) -> Result<LyricsData, String> {
    let mut offset_ms = 0;
    if let Ok(conn) = db.0.lock() {
        let normalized_path = normalize_db_path(Path::new(&path));
        let db_song = match SongRepo::get_by_path(&conn, &path) {
            Ok(Some(song)) => Ok(Some(song)),
            Ok(None) => SongRepo::get_by_path(&conn, &normalized_path),
            Err(error) => Err(error),
        };
        if let Ok(Some(song)) = db_song {
            offset_ms = song.lyrics_offset_ms;
            if let Some(lyrics_text) = song.lyrics_text.as_deref() {
                if !lyrics_text.trim().is_empty() {
                    let mut lyrics = crate::modules::library::lyrics_from_text(lyrics_text);
                    lyrics.offset_ms = offset_ms;
                    return Ok(lyrics);
                }
            }
        }
    }

    let mut lyrics = crate::modules::library::get_lyrics(&path)?;
    lyrics.offset_ms = offset_ms;
    Ok(lyrics)
}

#[tauri::command]
pub fn get_raw_lyrics(db: State<'_, DbState>, path: String) -> Result<Option<String>, String> {
    if let Ok(conn) = db.0.lock() {
        let normalized_path = normalize_db_path(Path::new(&path));
        let db_song = match SongRepo::get_by_path(&conn, &path) {
            Ok(Some(song)) => Ok(Some(song)),
            Ok(None) => SongRepo::get_by_path(&conn, &normalized_path),
            Err(error) => Err(error),
        };
        if let Ok(Some(song)) = db_song {
            if let Some(lyrics_text) = song.lyrics_text.as_deref() {
                if !lyrics_text.trim().is_empty() {
                    return Ok(Some(lyrics_text.to_string()));
                }
            }
        }
    }

    crate::modules::library::get_raw_lyrics(&path)
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
