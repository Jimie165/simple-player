use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player};
use std::fs::File;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;

use super::smtc;
use crate::modules::library::SongMetadata;

struct PlaybackHandle {
    _stream: MixerDeviceSink,
    player: Player,
    monitor_stop: Arc<AtomicBool>,
}

pub struct AudioState {
    player: Arc<Mutex<Option<PlaybackHandle>>>,
    volume: Arc<Mutex<f32>>,
    #[allow(dead_code)]
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

unsafe impl Send for AudioState {}
unsafe impl Sync for AudioState {}

impl AudioState {
    pub fn new() -> Self {
        Self {
            player: Arc::new(Mutex::new(None)),
            volume: Arc::new(Mutex::new(1.0)),
            app_handle: Arc::new(Mutex::new(None)),
        }
    }

    /// 在应用启动后调用，注入 AppHandle 并设置事件监听
    pub fn init_with_app_handle(
        &self,
        app_handle: AppHandle,
        #[cfg(target_os = "windows")] hwnd: Option<HWND>,
        #[cfg(not(target_os = "windows"))] _hwnd: Option<()>,
    ) {
        {
            let mut handle_lock = self.app_handle.lock().unwrap();
            *handle_lock = Some(app_handle.clone());
        }

        #[cfg(target_os = "windows")]
        smtc::init(app_handle, hwnd);
    }

    pub fn play_file(&self, path: String, metadata: Option<SongMetadata>) -> Result<(), String> {
        let file = File::open(&path).map_err(|e| format!("Failed to open audio file: {}", e))?;
        let source =
            Decoder::try_from(file).map_err(|e| format!("Failed to decode audio file: {}", e))?;
        let mut stream = DeviceSinkBuilder::open_default_sink()
            .map_err(|e| format!("Failed to open audio output: {}", e))?;
        stream.log_on_drop(false);
        let player = Player::connect_new(stream.mixer());
        player.set_volume(*self.volume.lock().unwrap());
        player.append(source);
        player.play();

        let monitor_stop = Arc::new(AtomicBool::new(false));
        let handle = PlaybackHandle {
            _stream: stream,
            player,
            monitor_stop: monitor_stop.clone(),
        };

        {
            let mut player_lock = self.player.lock().unwrap();
            if let Some(previous) = player_lock.take() {
                previous.monitor_stop.store(true, Ordering::SeqCst);
                previous.player.stop();
            }
            *player_lock = Some(handle);
        }

        if let Some(meta) = metadata.as_ref() {
            let app_handle = self.app_handle.lock().ok().and_then(|h| h.clone());
            let _ = smtc::apply_metadata(meta, app_handle.as_ref());
        }
        smtc::set_playing(true);

        if let Some(app_handle) = self.app_handle.lock().ok().and_then(|h| h.clone()) {
            let player_arc = self.player.clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(Duration::from_millis(250));
                    if monitor_stop.load(Ordering::SeqCst) {
                        break;
                    }

                    let (ended, position) = {
                        let player_lock = player_arc.lock().unwrap();
                        player_lock
                            .as_ref()
                            .map(|handle| {
                                (
                                    handle.monitor_stop.load(Ordering::SeqCst)
                                        || handle.player.empty(),
                                    handle.player.get_pos().as_secs_f32(),
                                )
                            })
                            .unwrap_or((false, 0.0))
                    };

                    smtc::set_position(position);

                    if ended {
                        if !monitor_stop.swap(true, Ordering::SeqCst) {
                            smtc::set_playing(false);
                            let _ = app_handle.emit("audio:ended", ());
                        }
                        break;
                    }
                }
            });
        }

        Ok(())
    }

    pub fn pause(&self) {
        if let Some(handle) = self.player.lock().unwrap().as_ref() {
            handle.player.pause();
            smtc::set_playing(false);
        }
    }

    pub fn resume(&self) {
        if let Some(handle) = self.player.lock().unwrap().as_ref() {
            handle.player.play();
            smtc::set_playing(true);
        }
    }

    pub fn seek(&self, seconds: f32) -> Result<f32, String> {
        if let Some(handle) = self.player.lock().unwrap().as_ref() {
            let position = Duration::from_secs_f32(seconds.max(0.0));
            handle
                .player
                .try_seek(position)
                .map_err(|e| format!("Failed to seek audio: {}", e))?;
            let actual = handle.player.get_pos().as_secs_f32();
            smtc::set_position(actual);
            return Ok(actual);
        }
        Ok(0.0)
    }

    pub fn set_volume(&self, volume: f32) {
        let clamped = volume.clamp(0.0, 1.0);
        *self.volume.lock().unwrap() = clamped;
        if let Some(handle) = self.player.lock().unwrap().as_ref() {
            handle.player.set_volume(clamped);
        }
    }

    pub fn get_position(&self) -> Result<f32, String> {
        if let Some(handle) = self.player.lock().unwrap().as_ref() {
            let position = handle.player.get_pos().as_secs_f32();
            smtc::set_position(position);
            return Ok(position);
        }
        Ok(0.0)
    }
}
