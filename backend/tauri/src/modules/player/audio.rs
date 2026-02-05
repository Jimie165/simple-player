use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use windows::Foundation::TypedEventHandler;
use windows::Foundation::Uri;
use windows::Media::Core::MediaSource;
use windows::Media::Playback::{
    MediaPlaybackCommandManagerNextReceivedEventArgs,
    MediaPlaybackCommandManagerPauseReceivedEventArgs,
    MediaPlaybackCommandManagerPlayReceivedEventArgs,
    MediaPlaybackCommandManagerPreviousReceivedEventArgs, MediaPlaybackItem, MediaPlayer,
};
use windows::core::HSTRING;

use super::smtc;
use crate::modules::library::SongMetadata;
use crate::utils::path::normalize_db_path;

pub struct AudioState {
    player: Arc<Mutex<Option<MediaPlayer>>>,
    #[allow(dead_code)]
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

unsafe impl Send for AudioState {}
unsafe impl Sync for AudioState {}

impl AudioState {
    pub fn new() -> Self {
        // 初始化 MediaPlayer
        let player = MediaPlayer::new().expect("Failed to create Windows MediaPlayer");

        // 开启自动 SMTC 集成
        let command_manager = player.CommandManager().unwrap();
        command_manager.SetIsEnabled(true).unwrap();

        // 启用播放控制按钮
        let smtc = player.SystemMediaTransportControls().unwrap();
        smtc.SetIsPlayEnabled(true).unwrap();
        smtc.SetIsPauseEnabled(true).unwrap();
        smtc.SetIsNextEnabled(true).unwrap();
        smtc.SetIsPreviousEnabled(true).unwrap();

        Self {
            player: Arc::new(Mutex::new(Some(player))),
            app_handle: Arc::new(Mutex::new(None)),
        }
    }

    /// 在应用启动后调用，注入 AppHandle 并设置事件监听
    pub fn init_with_app_handle(&self, app_handle: AppHandle) {
        {
            let mut handle_lock = self.app_handle.lock().unwrap();
            *handle_lock = Some(app_handle.clone());
        }

        let player_arc = self.player.clone();
        let app_handle_bg = app_handle.clone();

        std::thread::spawn(move || {
            println!("[DEBUG] SMTC init thread started");
            // 5. 【核心修复】监听媒体结束事件
            if let Some(player) = player_arc.lock().unwrap().as_ref() {
                let app_handle_inner = app_handle_bg.clone();

                // 我们捕捉 MediaEnded 事件并推送到前端
                let _ = player.MediaEnded(&TypedEventHandler::new(move |_, _| {
                    let _ = app_handle_inner.emit("audio:ended", ());
                    Ok(())
                }));
            }

            // 监听 SMTC 上一首/下一首按钮，转发给前端处理
            if let Some(player) = player_arc.lock().unwrap().as_ref() {
                let command_manager = match player.CommandManager() {
                    Ok(cm) => cm,
                    Err(e) => {
                        println!("[DEBUG] Failed to get CommandManager: {:?}", e);
                        return;
                    }
                };

                // Configure CommandManager behaviors
                if let Ok(next_behavior) = command_manager.NextBehavior() {
                    let _ = next_behavior
                        .SetEnablingRule(windows::Media::Playback::MediaCommandEnablingRule::Always);
                }
                if let Ok(prev_behavior) = command_manager.PreviousBehavior() {
                    let _ = prev_behavior
                        .SetEnablingRule(windows::Media::Playback::MediaCommandEnablingRule::Always);
                }
                if let Ok(play_behavior) = command_manager.PlayBehavior() {
                    let _ = play_behavior
                        .SetEnablingRule(windows::Media::Playback::MediaCommandEnablingRule::Always);
                }
                if let Ok(pause_behavior) = command_manager.PauseBehavior() {
                    let _ = pause_behavior
                        .SetEnablingRule(windows::Media::Playback::MediaCommandEnablingRule::Always);
                }

                let app_handle_play = app_handle_bg.clone();
                let _ = command_manager.PlayReceived(&TypedEventHandler::new(
                    move |_,
                          _args: windows::core::Ref<
                        '_,
                        MediaPlaybackCommandManagerPlayReceivedEventArgs,
                    >| {
                        let _ = app_handle_play.emit("smtc:play", ());
                        Ok(())
                    },
                ));

                let app_handle_pause = app_handle_bg.clone();
                let _ = command_manager.PauseReceived(&TypedEventHandler::new(
                    move |_,
                          _args: windows::core::Ref<
                        '_,
                        MediaPlaybackCommandManagerPauseReceivedEventArgs,
                    >| {
                        let _ = app_handle_pause.emit("smtc:pause", ());
                        Ok(())
                    },
                ));

                let app_handle_next = app_handle_bg.clone();
                let _ = command_manager.NextReceived(&TypedEventHandler::new(
                    move |_,
                          _args: windows::core::Ref<
                        '_,
                        MediaPlaybackCommandManagerNextReceivedEventArgs,
                    >| {
                        let _ = app_handle_next.emit("smtc:next", ());
                        Ok(())
                    },
                ));

                let app_handle_prev = app_handle_bg.clone();
                let _ = command_manager.PreviousReceived(&TypedEventHandler::new(
                    move |_,
                          _args: windows::core::Ref<
                        '_,
                        MediaPlaybackCommandManagerPreviousReceivedEventArgs,
                    >| {
                        let _ = app_handle_prev.emit("smtc:previous", ());
                        Ok(())
                    },
                ));
            }
            println!("[DEBUG] SMTC init thread finished");
        });
    }

    pub fn play_file(&self, path: String, metadata: Option<SongMetadata>) -> Result<(), String> {
        let player_lock = self.player.lock().unwrap();
        if let Some(player) = player_lock.as_ref() {
            // Ensure SMTC buttons stay enabled during playback
            if let Ok(smtc) = player.SystemMediaTransportControls() {
                let _ = smtc.SetIsPlayEnabled(true);
                let _ = smtc.SetIsPauseEnabled(true);
                let _ = smtc.SetIsNextEnabled(true);
                let _ = smtc.SetIsPreviousEnabled(true);
            }

            // 1. 创建 URI
            let path_uri = format!("file:///{}", normalize_db_path(&std::path::Path::new(&path)));
            let uri = Uri::CreateUri(&HSTRING::from(&path_uri))
                .map_err(|e| format!("Invalid URI: {}", e))?;

            // 2. 创建 MediaSource
            let source = MediaSource::CreateFromUri(&uri)
                .map_err(|e| format!("Failed to create source: {}", e))?;

            // 3. 创建 MediaPlaybackItem
            let item = MediaPlaybackItem::Create(&source)
                .map_err(|e| format!("Failed to create playback item: {}", e))?;

            // 4. 如果有元数据，应用到 Item 上
            if let Some(meta) = metadata {
                let _ = smtc::apply_metadata(&item, &meta);
            }

            // 5. 播放 Item
            player
                .SetSource(&item)
                .map_err(|e| e.message().to_string())?;
            player.Play().map_err(|e| e.message().to_string())?;
        }
        Ok(())
    }

    pub fn pause(&self) {
        if let Some(player) = self.player.lock().unwrap().as_ref() {
            let _ = player.Pause();
        }
    }

    pub fn resume(&self) {
        if let Some(player) = self.player.lock().unwrap().as_ref() {
            let _ = player.Play();
        }
    }

    pub fn seek(&self, seconds: f32) -> Result<(), String> {
        if let Some(player) = self.player.lock().unwrap().as_ref() {
            let ticks = (seconds * 10_000_000.0) as i64;
            let session = player.PlaybackSession().map_err(|e| e.to_string())?;
            session
                .SetPosition(windows::Foundation::TimeSpan { Duration: ticks })
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn set_volume(&self, volume: f32) {
        if let Some(player) = self.player.lock().unwrap().as_ref() {
            let _ = player.SetVolume(volume as f64);
        }
    }

    pub fn get_position(&self) -> Result<f32, String> {
        if let Some(player) = self.player.lock().unwrap().as_ref() {
            let session = player.PlaybackSession().map_err(|e| e.to_string())?;
            let position = session.Position().map_err(|e| e.to_string())?;
            return Ok((position.Duration as f32) / 10_000_000.0);
        }
        Ok(0.0)
    }
}
