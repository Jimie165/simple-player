use serde::Deserialize;

#[derive(Clone, Deserialize, PartialEq)]
pub struct MediaInfo {
    pub(super) title: String,
    pub(super) artist: String,
    pub(super) album: String,
    pub(super) cover_path: Option<String>,
    pub(super) duration: f64,
}

/// Publishes video through the same application-owned SMTC session as music.
#[tauri::command]
pub fn update_windows_video_media(
    app: tauri::AppHandle,
    metadata: Option<MediaInfo>,
    playing: bool,
    position: f64,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        super::smtc::update_video(&app, metadata.as_ref(), playing, position)
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, metadata, playing, position);
        Ok(())
    }
}
