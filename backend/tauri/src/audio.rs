use std::sync::{Arc, Mutex};
use windows::Foundation::Uri;
use windows::Media::Core::MediaSource;
use windows::Media::Playback::{MediaPlaybackItem, MediaPlayer}; // 引入 MediaPlaybackItem
use windows::core::HSTRING;

// 引入元数据结构
use crate::metadata::SongMetadata;
// 引入 SMTC 模块
use crate::smtc;

pub struct AudioState {
    player: Arc<Mutex<Option<MediaPlayer>>>,
}

unsafe impl Send for AudioState {}
unsafe impl Sync for AudioState {}

impl AudioState {
    pub fn new() -> Self {
        // 初始化 MediaPlayer
        let player = MediaPlayer::new().expect("Failed to create Windows MediaPlayer");

        // 开启自动 SMTC 集成
        // 注意：当我们使用 MediaPlaybackItem 时，MediaPlayer 会自动帮我们更新 SMTC
        // 但前提是 CommandManager 必须启用
        let command_manager = player.CommandManager().unwrap();
        command_manager.SetIsEnabled(true).unwrap();

        // 这一步是告诉播放器：“我要用你的 Play/Pause 按钮功能”
        let smtc = player.SystemMediaTransportControls().unwrap();
        smtc.SetIsPlayEnabled(true).unwrap();
        smtc.SetIsPauseEnabled(true).unwrap();
        smtc.SetIsNextEnabled(true).unwrap();
        smtc.SetIsPreviousEnabled(true).unwrap();

        Self {
            player: Arc::new(Mutex::new(Some(player))),
        }
    }

    pub fn play_file(&self, path: String, metadata: Option<SongMetadata>) -> Result<(), String> {
        let player_lock = self.player.lock().unwrap();
        if let Some(player) = player_lock.as_ref() {
            // 1. 创建 URI
            let path_uri = format!("file:///{}", path.replace('\\', "/"));
            let uri = Uri::CreateUri(&HSTRING::from(&path_uri))
                .map_err(|e| format!("Invalid URI: {}", e))?;

            // 2. 创建 MediaSource
            let source = MediaSource::CreateFromUri(&uri)
                .map_err(|e| format!("Failed to create source: {}", e))?;

            // 3. 【关键步骤】创建 MediaPlaybackItem
            // 相比直接 SetSource，使用 Item 可以让我们绑定元数据
            let item = MediaPlaybackItem::Create(&source)
                .map_err(|e| format!("Failed to create playback item: {}", e))?;

            // 4. 【关键步骤】如果有元数据，直接应用到 Item 上
            // 这样 Windows 播放时会直接显示我们提供的信息，而不会去读文件里的垃圾信息
            if let Some(meta) = metadata {
                // 忽略错误，SMTC 更新失败不应阻止播放
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
}
