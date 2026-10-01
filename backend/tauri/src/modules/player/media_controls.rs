use serde::Deserialize;

#[derive(Clone, Deserialize, PartialEq)]
pub struct MediaInfo {
    pub(super) title: String,
    pub(super) artist: String,
    pub(super) album: String,
    pub(super) cover_path: Option<String>,
    pub(super) duration: f64,
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

#[cfg(target_os = "macos")]
pub mod macos {
    use super::MediaInfo;
    use souvlaki::{
        MediaControlEvent, MediaControls, MediaPlayback, MediaPosition, PlatformConfig,
    };
    use std::{path::PathBuf, sync::Mutex, time::Duration};
    use tauri::{Emitter, Manager};

    #[derive(Default)]
    pub struct MediaState(Mutex<Option<Session>>);

    struct Session {
        controls: MediaControls,
        metadata: Option<MediaInfo>,
        artwork: Option<Vec<u8>>,
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
                artwork: None,
            });
        }
        let session = current.as_mut().ok_or("Media controls unavailable")?;
        let cover_path = metadata
            .as_ref()
            .and_then(|info| info.cover_path.as_deref())
            .and_then(|path| {
                if crate::utils::paths::is_app_relative_path(path) {
                    crate::utils::paths::resolve_app_path(app, path)
                } else {
                    Some(PathBuf::from(path))
                }
            });
        if session.metadata != metadata || (session.artwork.is_none() && cover_path.is_some()) {
            session.artwork = cover_path.and_then(|path| std::fs::read(path).ok());
        }
        // Publish one complete snapshot on the main thread. Souvlaki's asynchronous
        // artwork writer can overwrite a later position or a different video's cover.
        publish_now_playing(
            metadata.as_ref(),
            session.artwork.as_deref(),
            playing,
            position,
        )?;
        session.metadata = metadata;
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

    fn publish_now_playing(
        info: Option<&MediaInfo>,
        artwork: Option<&[u8]>,
        playing: bool,
        position: f64,
    ) -> Result<(), String> {
        use block2::RcBlock;
        use objc2::{
            AnyThread, msg_send,
            rc::{Allocated, Retained},
            runtime::{AnyClass, AnyObject},
        };
        use objc2_app_kit::NSImage;
        use objc2_foundation::{NSData, NSMutableDictionary, NSNumber, NSSize, NSString};

        #[link(name = "MediaPlayer", kind = "framework")]
        unsafe extern "C" {
            static MPMediaItemPropertyTitle: &'static NSString;
            static MPMediaItemPropertyArtist: &'static NSString;
            static MPMediaItemPropertyAlbumTitle: &'static NSString;
            static MPMediaItemPropertyArtwork: &'static NSString;
            static MPMediaItemPropertyPlaybackDuration: &'static NSString;
            static MPNowPlayingInfoPropertyElapsedPlaybackTime: &'static NSString;
            static MPNowPlayingInfoPropertyPlaybackRate: &'static NSString;
        }
        let center_class =
            AnyClass::get(c"MPNowPlayingInfoCenter").ok_or("MPNowPlayingInfoCenter unavailable")?;
        // The command dispatches here only on the AppKit main thread; dictionaries
        // and the artwork block retain their values after this snapshot is submitted.
        unsafe {
            let center: Retained<AnyObject> = msg_send![center_class, defaultCenter];
            let Some(info) = info else {
                let _: () = msg_send![&*center, setNowPlayingInfo: std::ptr::null::<AnyObject>()];
                return Ok(());
            };
            let dictionary = NSMutableDictionary::<NSString, AnyObject>::new();
            dictionary.insert(MPMediaItemPropertyTitle, &NSString::from_str(&info.title));
            dictionary.insert(MPMediaItemPropertyArtist, &NSString::from_str(&info.artist));
            dictionary.insert(
                MPMediaItemPropertyAlbumTitle,
                &NSString::from_str(&info.album),
            );
            dictionary.insert(
                MPMediaItemPropertyPlaybackDuration,
                &NSNumber::numberWithDouble(info.duration.max(0.0)),
            );
            dictionary.insert(
                MPNowPlayingInfoPropertyElapsedPlaybackTime,
                &NSNumber::numberWithDouble(position.max(0.0)),
            );
            dictionary.insert(
                MPNowPlayingInfoPropertyPlaybackRate,
                &NSNumber::numberWithDouble(if playing { 1.0 } else { 0.0 }),
            );
            if let Some(bytes) = artwork {
                let data = NSData::with_bytes(bytes);
                if let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) {
                    let size = image.size();
                    let handler = RcBlock::new(move |_: NSSize| -> *mut NSImage {
                        Retained::as_ptr(&image).cast_mut()
                    });
                    let class = AnyClass::get(c"MPMediaItemArtwork")
                        .ok_or("MPMediaItemArtwork unavailable")?;
                    let allocated: Allocated<AnyObject> = msg_send![class, alloc];
                    let native_artwork: Retained<AnyObject> =
                        msg_send![allocated, initWithBoundsSize: size, requestHandler: &*handler];
                    dictionary.insert(MPMediaItemPropertyArtwork, &native_artwork);
                }
            }
            let _: () = msg_send![&*center, setNowPlayingInfo: &*dictionary];
        }
        Ok(())
    }

    fn seconds(value: f64) -> Option<Duration> {
        Duration::try_from_secs_f64(value).ok()
    }
}
