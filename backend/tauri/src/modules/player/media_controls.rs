use serde::Deserialize;

#[derive(Clone, Deserialize, PartialEq)]
pub struct MediaInfo {
    title: String,
    artist: String,
    album: String,
    cover_path: Option<String>,
    duration: f64,
}

/// Synchronizes the active audio/video session with macOS Now Playing.
#[tauri::command]
pub fn update_macos_media(
    app: tauri::AppHandle,
    metadata: Option<MediaInfo>,
    playing: bool,
    position: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let handle = app.clone();
        // MediaPlayer/AppKit calls must run on the application's main thread.
        app.run_on_main_thread(move || {
            if let Err(error) = macos::update(&handle, metadata, playing, position) {
                eprintln!("macOS media controls: {error}");
            }
        })
        .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, metadata, playing, position);
        Ok(())
    }
}

#[cfg(target_os = "macos")]
pub mod macos {
    use super::MediaInfo;
    use souvlaki::{
        MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition,
        PlatformConfig,
    };
    use std::{path::PathBuf, sync::Mutex, time::Duration};
    use tauri::{Emitter, Manager};

    #[derive(Default)]
    pub struct MediaState(Mutex<Option<Session>>);

    struct Session {
        controls: MediaControls,
        metadata: Option<MediaInfo>,
    }

    #[derive(Clone, serde::Serialize)]
    struct Action {
        action: &'static str,
        position: Option<f64>,
    }

    pub fn update(
        app: &tauri::AppHandle,
        metadata: Option<MediaInfo>,
        playing: bool,
        position: f64,
    ) -> Result<(), String> {
        let state = app.state::<MediaState>();
        let mut current = state.0.lock().map_err(|error| error.to_string())?;
        if current.is_none() {
            if metadata.is_none() {
                return Ok(());
            }
            let mut controls = MediaControls::new(PlatformConfig {
                dbus_name: "simple_player",
                display_name: "Simple Player",
                hwnd: None,
            })
            .map_err(|error| format!("{error:?}"))?;
            let handle = app.clone();
            controls
                .attach(move |event| {
                    let (action, position) = match event {
                        MediaControlEvent::Play => ("play", None),
                        MediaControlEvent::Pause => ("pause", None),
                        MediaControlEvent::Toggle => ("toggle", None),
                        MediaControlEvent::Next => ("next", None),
                        MediaControlEvent::Previous => ("previous", None),
                        MediaControlEvent::SetPosition(position) => {
                            ("seek", Some(position.0.as_secs_f64()))
                        }
                        _ => return,
                    };
                    let _ = handle.emit("macos-media:action", Action { action, position });
                })
                .map_err(|error| format!("{error:?}"))?;
            *current = Some(Session {
                controls,
                metadata: None,
            });
        }
        let session = current.as_mut().ok_or("Media controls unavailable")?;
        if session.metadata != metadata {
            let cover_url = metadata
                .as_ref()
                .and_then(|info| info.cover_path.as_deref())
                .and_then(|path| {
                    let path = if crate::utils::paths::is_app_relative_path(path) {
                        crate::utils::paths::resolve_app_path(app, path)?
                    } else {
                        PathBuf::from(path)
                    };
                    if !path.is_file() {
                        return None;
                    }
                    url::Url::from_file_path(path)
                        .ok()
                        .map(|url| url.to_string())
                });
            let info = metadata.as_ref();
            session
                .controls
                .set_metadata(MediaMetadata {
                    title: info.map(|info| info.title.as_str()),
                    artist: info.map(|info| info.artist.as_str()),
                    album: info.map(|info| info.album.as_str()),
                    cover_url: cover_url.as_deref(),
                    duration: info.and_then(|info| seconds(info.duration)),
                })
                .map_err(|error| format!("{error:?}"))?;
            session.metadata = metadata;
        }
        let progress = seconds(position).map(MediaPosition);
        let playback = if session.metadata.is_none() {
            MediaPlayback::Stopped
        } else if playing {
            MediaPlayback::Playing { progress }
        } else {
            MediaPlayback::Paused { progress }
        };
        session
            .controls
            .set_playback(playback)
            .map_err(|error| format!("{error:?}"))?;
        if session.metadata.is_none() {
            // Dropping on the main thread detaches the native command handlers.
            *current = None;
        }
        Ok(())
    }

    fn seconds(value: f64) -> Option<Duration> {
        Duration::try_from_secs_f64(value).ok()
    }
}
