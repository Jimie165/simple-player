// rodio 0.22 标了 DeviceTrait::name 为 deprecated（推荐 id()/description()），
// 但 id() 返回的是不可序列化的 DeviceId，对我们「按设备名持久化用户偏好」的用法
// 反而更复杂；这里继续用 name()，集中在本模块抑制相关 deprecation 警告。
#![allow(deprecated)]

use cpal::traits::{DeviceTrait, HostTrait};
use rodio::{
    ChannelCount, Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, SampleRate, Source,
    source::SeekError,
};
use serde::Serialize;
use std::fs::File;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicU64, Ordering},
};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;

use super::smtc;
use crate::modules::library::SongMetadata;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackStatus {
    Idle,
    Playing,
    Paused,
    Ended,
}

#[derive(Clone, Serialize)]
pub struct PlaybackSnapshot {
    pub session_id: u64,
    pub status: PlaybackStatus,
    pub path: Option<String>,
    pub position: f32,
    pub duration: Option<f32>,
    pub volume: f32,
}

struct LowFrequencySource<S> {
    input: S,
    analysis: super::reactive::AnalysisInput,
    channel_count: u16,
    channel_index: u16,
    frame: [f32; 2],
}

impl<S: Source> LowFrequencySource<S> {
    fn new(input: S, level: Arc<super::reactive::ReactiveState>) -> Self {
        Self {
            analysis: super::reactive::AnalysisInput::new(input.sample_rate().get(), level),
            channel_count: input.channels().get(),
            input,
            channel_index: 0,
            frame: [0.0; 2],
        }
    }
}

impl<S: Source> Iterator for LowFrequencySource<S> {
    type Item = f32;
    fn next(&mut self) -> Option<Self::Item> {
        let sample = self.input.next()?;
        // Keep front L/R separate: averaging before analysis cancels anti-phase bass.
        if self.channel_index < 2 {
            self.frame[self.channel_index as usize] = sample;
        }
        self.channel_index += 1;
        if self.channel_index >= self.channel_count {
            if self.channel_count == 1 {
                self.frame[1] = self.frame[0];
            }
            self.analysis.push(self.frame);
            self.channel_index = 0;
        }
        Some(sample)
    }
}

impl<S: Source> Source for LowFrequencySource<S> {
    fn current_span_len(&self) -> Option<usize> {
        self.input.current_span_len()
    }
    fn channels(&self) -> ChannelCount {
        self.input.channels()
    }
    fn sample_rate(&self) -> SampleRate {
        self.input.sample_rate()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.input.total_duration()
    }
    fn try_seek(&mut self, position: Duration) -> Result<(), SeekError> {
        self.input.try_seek(position)?;
        self.channel_index = 0;
        self.frame = [0.0; 2];
        self.analysis.reset();
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub enum OutputPreference {
    SystemDefault,
    Pinned(String),
}

#[derive(Serialize, Clone)]
pub struct AudioOutputInfo {
    pub id: String,
    pub name: String,
    pub is_system_default: bool,
    pub is_active: bool,
}

#[derive(Serialize, Clone)]
pub struct AudioOutputState {
    pub preference: Option<String>, // None = follow system default
    pub active_device: Option<String>,
}

struct PlaybackHandle {
    _stream: MixerDeviceSink,
    player: Player,
    monitor_stop: Arc<AtomicBool>,
    stream_error: Arc<AtomicBool>,
    path: String,
    metadata: Option<SongMetadata>,
    session_id: u64,
}

fn snapshot_from_parts(
    player: &Arc<Mutex<Option<PlaybackHandle>>>,
    volume: &Arc<Mutex<f32>>,
) -> PlaybackSnapshot {
    let volume = *volume.lock().unwrap();
    let player_lock = player.lock().unwrap();
    let Some(handle) = player_lock.as_ref() else {
        return PlaybackSnapshot {
            session_id: 0,
            status: PlaybackStatus::Idle,
            path: None,
            position: 0.0,
            duration: None,
            volume,
        };
    };

    let position = handle.player.get_pos().as_secs_f32();
    let status = if handle.player.empty() {
        PlaybackStatus::Ended
    } else if handle.player.is_paused() {
        PlaybackStatus::Paused
    } else {
        PlaybackStatus::Playing
    };

    PlaybackSnapshot {
        session_id: handle.session_id,
        status,
        path: Some(handle.path.clone()),
        position,
        duration: handle.metadata.as_ref().map(|meta| meta.duration as f32),
        volume,
    }
}

pub struct AudioState {
    player: Arc<Mutex<Option<PlaybackHandle>>>,
    next_session_id: AtomicU64,
    volume: Arc<Mutex<f32>>,
    output_preference: Arc<Mutex<OutputPreference>>,
    active_device_name: Arc<Mutex<Option<String>>>,
    reactive_background_enabled: Arc<AtomicBool>,
    low_frequency_level: Arc<super::reactive::ReactiveState>,
    #[allow(dead_code)]
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

unsafe impl Send for AudioState {}
unsafe impl Sync for AudioState {}

impl AudioState {
    pub fn new() -> Self {
        let low_frequency_level = Arc::new(super::reactive::ReactiveState::new());
        Self {
            player: Arc::new(Mutex::new(None)),
            next_session_id: AtomicU64::new(1),
            volume: Arc::new(Mutex::new(1.0)),
            output_preference: Arc::new(Mutex::new(OutputPreference::SystemDefault)),
            active_device_name: Arc::new(Mutex::new(None)),
            reactive_background_enabled: low_frequency_level.enabled.clone(),
            low_frequency_level,
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

    fn open_file(
        &self,
        path: String,
        metadata: Option<SongMetadata>,
        autoplay: bool,
    ) -> Result<PlaybackSnapshot, String> {
        let session_id = self.next_session_id.fetch_add(1, Ordering::Relaxed);
        let handle = Self::build_playback_handle(
            &self.volume,
            &self.output_preference,
            &self.active_device_name,
            &self.low_frequency_level,
            path.clone(),
            metadata.clone(),
            autoplay,
            0.0,
            session_id,
        )?;
        let monitor_stop = handle.monitor_stop.clone();
        let previous = {
            let mut player_lock = self.player.lock().unwrap();
            let previous = player_lock.take();
            *player_lock = Some(handle);
            previous
        };
        Self::dispose_playback(previous);

        if let Some(meta) = metadata.as_ref() {
            let app_handle = self.app_handle.lock().ok().and_then(|h| h.clone());
            let _ = smtc::apply_metadata(meta, app_handle.as_ref());
        }
        smtc::set_playing(autoplay);

        if let Some(app_handle) = self.app_handle.lock().ok().and_then(|h| h.clone()) {
            Self::emit_output_changed(&app_handle, &self.active_device_name);
            self.emit_state_changed(&app_handle);
            Self::start_monitor(
                self.player.clone(),
                self.volume.clone(),
                self.output_preference.clone(),
                self.active_device_name.clone(),
                self.reactive_background_enabled.clone(),
                self.low_frequency_level.clone(),
                app_handle.clone(),
                monitor_stop.clone(),
            );
            Self::start_reactive_monitor(
                app_handle,
                self.reactive_background_enabled.clone(),
                self.low_frequency_level.clone(),
                monitor_stop,
            );
        }

        Ok(self.snapshot())
    }

    // Playback construction needs these synchronized state handles as one atomic setup step.
    #[allow(clippy::too_many_arguments)]
    fn build_playback_handle(
        volume: &Arc<Mutex<f32>>,
        preference: &Arc<Mutex<OutputPreference>>,
        active_device_name: &Arc<Mutex<Option<String>>>,
        low_frequency_level: &Arc<super::reactive::ReactiveState>,
        path: String,
        metadata: Option<SongMetadata>,
        autoplay: bool,
        start_position: f32,
        session_id: u64,
    ) -> Result<PlaybackHandle, String> {
        let file = File::open(&path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                // Stable error code for the frontend; OS messages are localized.
                "AUDIO_FILE_NOT_FOUND".to_string()
            } else {
                format!("Failed to open audio file: {}", e)
            }
        })?;
        let source =
            Decoder::try_from(file).map_err(|e| format!("Failed to decode audio file: {}", e))?;

        let stream_error = Arc::new(AtomicBool::new(false));
        let pref_snapshot = preference.lock().unwrap().clone();
        let (mut stream, picked_name, fell_back_to_default) =
            Self::open_output_sink(pref_snapshot.clone(), stream_error.clone())?;
        if fell_back_to_default {
            let mut current = preference.lock().unwrap();
            if matches!((&*current, &pref_snapshot),
                (OutputPreference::Pinned(current_id), OutputPreference::Pinned(opened_id))
                    if current_id == opened_id)
            {
                *current = OutputPreference::SystemDefault;
            }
        }
        stream.log_on_drop(false);
        *active_device_name.lock().unwrap() = picked_name;

        let player = Player::connect_new(stream.mixer());
        player.set_volume(*volume.lock().unwrap());
        player.append(LowFrequencySource::new(source, low_frequency_level.clone()));

        if start_position > 0.0 {
            let position = Duration::from_secs_f32(start_position.max(0.0));
            if let Err(err) = player.try_seek(position) {
                eprintln!("Failed to restore audio position after output change: {err}");
            }
        }

        if autoplay {
            player.play();
        } else {
            player.pause();
        }

        Ok(PlaybackHandle {
            _stream: stream,
            player,
            monitor_stop: Arc::new(AtomicBool::new(false)),
            stream_error,
            path,
            metadata,
            session_id,
        })
    }

    fn open_output_sink(
        preference: OutputPreference,
        stream_error: Arc<AtomicBool>,
    ) -> Result<(MixerDeviceSink, Option<String>, bool), String> {
        let error_flag = stream_error;
        let (builder, picked_name, fell_back_to_default) = match preference {
            OutputPreference::Pinned(target_id) => match Self::find_output_device(&target_id) {
                Some(device) => {
                    let name = Self::device_display_name(&device);
                    (
                        DeviceSinkBuilder::from_device(device)
                            .map_err(|e| format!("Failed to open audio output: {}", e))?,
                        name,
                        false,
                    )
                }
                None => {
                    eprintln!(
                        "audio: pinned endpoint '{target_id}' is unavailable; using system default"
                    );
                    let name = Self::default_output_name();
                    (
                        DeviceSinkBuilder::from_default_device()
                            .map_err(|e| format!("Failed to open audio output: {}", e))?,
                        name,
                        true,
                    )
                }
            },
            OutputPreference::SystemDefault => {
                let name = Self::default_output_name();
                (
                    DeviceSinkBuilder::from_default_device()
                        .map_err(|e| format!("Failed to open audio output: {}", e))?,
                    name,
                    false,
                )
            }
        };

        let sink = builder
            .with_error_callback(move |err| {
                eprintln!("audio stream error: {err}");
                error_flag.store(true, Ordering::SeqCst);
            })
            .open_sink_or_fallback()
            .map_err(|e| format!("Failed to open audio output: {}", e))?;

        Ok((sink, picked_name, fell_back_to_default))
    }

    fn device_id(device: &cpal::Device) -> Option<String> {
        device.id().ok().map(|id| id.1)
    }

    fn device_display_name(device: &cpal::Device) -> Option<String> {
        let description = device.description().ok()?;
        description
            .extended()
            .iter()
            .find(|line| !line.trim().is_empty())
            .cloned()
            .or_else(|| Some(description.name().to_string()))
    }

    fn find_output_device(target_id: &str) -> Option<cpal::Device> {
        cpal::default_host()
            .output_devices()
            .ok()?
            .find(|device| Self::device_id(device).as_deref() == Some(target_id))
    }

    fn resolve_output_device_id(value: &str) -> Option<String> {
        let devices: Vec<_> = cpal::default_host().output_devices().ok()?.collect();

        // Current preferences use endpoint IDs. Name matching is only a one-time
        // migration path for preferences persisted by older app versions.
        if let Some(id) = devices
            .iter()
            .filter_map(Self::device_id)
            .find(|id| id == value)
        {
            return Some(id);
        }

        devices.into_iter().find_map(|device| {
            let matches_old_name = device.name().ok().as_deref() == Some(value)
                || Self::device_display_name(&device).as_deref() == Some(value);
            matches_old_name.then(|| Self::device_id(&device)).flatten()
        })
    }

    fn default_output_name() -> Option<String> {
        cpal::default_host()
            .default_output_device()
            .and_then(|device| Self::device_display_name(&device))
    }

    fn emit_output_changed(
        app_handle: &AppHandle,
        active_device_name: &Arc<Mutex<Option<String>>>,
    ) {
        let active = active_device_name.lock().ok().and_then(|g| g.clone());
        let _ = app_handle.emit("audio:output-changed", active);
    }

    fn snapshot(&self) -> PlaybackSnapshot {
        snapshot_from_parts(&self.player, &self.volume)
    }

    fn emit_state_changed(&self, app_handle: &AppHandle) {
        let _ = app_handle.emit("audio:state-changed", self.snapshot());
    }

    fn dispose_playback(previous: Option<PlaybackHandle>) {
        if let Some(previous) = previous {
            previous.monitor_stop.store(true, Ordering::SeqCst);
            previous.player.stop();

            // Dropping a WASAPI stream joins CPAL's audio thread. If the output
            // device was removed, that join can stall, so keep it off the command path.
            let _ = thread::Builder::new()
                .name("audio_stream_drop".to_string())
                .spawn(move || drop(previous));
        }
    }

    // The monitor owns clones of each playback state handle for its worker lifetime.
    #[allow(clippy::too_many_arguments)]
    fn start_monitor(
        player_arc: Arc<Mutex<Option<PlaybackHandle>>>,
        volume_arc: Arc<Mutex<f32>>,
        preference: Arc<Mutex<OutputPreference>>,
        active_device_name: Arc<Mutex<Option<String>>>,
        reactive_background_enabled: Arc<AtomicBool>,
        low_frequency_level: Arc<super::reactive::ReactiveState>,
        app_handle: AppHandle,
        monitor_stop: Arc<AtomicBool>,
    ) {
        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_millis(250));
                if monitor_stop.load(Ordering::SeqCst) {
                    break;
                }

                let mut recovery: Option<(String, Option<SongMetadata>, bool, f32, u64)> = None;
                let (ended, position, session_id) = {
                    let player_lock = player_arc.lock().unwrap();
                    let Some(handle) = player_lock.as_ref() else {
                        break;
                    };

                    if !Arc::ptr_eq(&handle.monitor_stop, &monitor_stop) {
                        break;
                    }

                    let position = handle.player.get_pos().as_secs_f32();
                    let stream_failed = handle.stream_error.load(Ordering::SeqCst);
                    let follow_drift = !stream_failed
                        && matches!(*preference.lock().unwrap(), OutputPreference::SystemDefault)
                        && Self::system_default_drifted(&active_device_name);

                    if stream_failed || follow_drift {
                        recovery = Some((
                            handle.path.clone(),
                            handle.metadata.clone(),
                            !handle.player.is_paused(),
                            position,
                            handle.session_id,
                        ));
                        (false, position, handle.session_id)
                    } else {
                        (handle.player.empty(), position, handle.session_id)
                    }
                };

                if let Some((path, metadata, should_play, position, session_id)) = recovery {
                    if !monitor_stop.swap(true, Ordering::SeqCst) {
                        match Self::recover_output_device(
                            player_arc.clone(),
                            volume_arc.clone(),
                            preference.clone(),
                            active_device_name.clone(),
                            reactive_background_enabled.clone(),
                            low_frequency_level.clone(),
                            app_handle.clone(),
                            monitor_stop.clone(),
                            path,
                            metadata,
                            should_play,
                            position,
                            session_id,
                        ) {
                            Ok(()) => {}
                            Err(err) => {
                                eprintln!("Failed to recover audio output: {err}");
                                smtc::set_playing(false);
                                let _ = app_handle.emit("audio:output-error", err);
                            }
                        }
                    }
                    break;
                }

                smtc::set_position(position);

                if ended {
                    if !monitor_stop.swap(true, Ordering::SeqCst) {
                        smtc::set_playing(false);
                        let _ = app_handle.emit(
                            "audio:state-changed",
                            snapshot_from_parts(&player_arc, &volume_arc),
                        );
                        let _ = app_handle.emit("audio:ended", session_id);
                    }
                    break;
                }
            }
        });
    }

    fn start_reactive_monitor(
        app_handle: AppHandle,
        enabled: Arc<AtomicBool>,
        level: Arc<super::reactive::ReactiveState>,
        monitor_stop: Arc<AtomicBool>,
    ) {
        thread::spawn(move || {
            while !monitor_stop.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(33));
                if enabled.load(Ordering::Relaxed) {
                    let frame = level.frame();
                    let _ = app_handle.emit("audio:low-frequency", frame);
                }
            }
        });
    }

    fn system_default_drifted(active_device_name: &Arc<Mutex<Option<String>>>) -> bool {
        let Some(default_name) = Self::default_output_name() else {
            return false;
        };
        let active = active_device_name.lock().ok().and_then(|g| g.clone());
        active.as_deref() != Some(default_name.as_str())
    }

    // Recovery must transfer both shared playback state and the current track snapshot.
    #[allow(clippy::too_many_arguments)]
    fn recover_output_device(
        player_arc: Arc<Mutex<Option<PlaybackHandle>>>,
        volume_arc: Arc<Mutex<f32>>,
        preference: Arc<Mutex<OutputPreference>>,
        active_device_name: Arc<Mutex<Option<String>>>,
        reactive_background_enabled: Arc<AtomicBool>,
        low_frequency_level: Arc<super::reactive::ReactiveState>,
        app_handle: AppHandle,
        expected_monitor: Arc<AtomicBool>,
        path: String,
        metadata: Option<SongMetadata>,
        autoplay: bool,
        position: f32,
        session_id: u64,
    ) -> Result<(), String> {
        let new_handle = Self::build_playback_handle(
            &volume_arc,
            &preference,
            &active_device_name,
            &low_frequency_level,
            path,
            metadata.clone(),
            autoplay,
            position,
            session_id,
        )?;
        let new_monitor_stop = new_handle.monitor_stop.clone();

        let previous = {
            let mut player_lock = player_arc.lock().unwrap();
            let Some(current) = player_lock.as_ref() else {
                return Ok(());
            };

            if !Arc::ptr_eq(&current.monitor_stop, &expected_monitor) {
                return Ok(());
            }

            let previous = player_lock.take();
            *player_lock = Some(new_handle);
            previous
        };
        Self::dispose_playback(previous);

        if let Some(meta) = metadata.as_ref() {
            let _ = smtc::apply_metadata(meta, Some(&app_handle));
        }
        smtc::set_playing(autoplay);
        smtc::set_position(position);
        Self::emit_output_changed(&app_handle, &active_device_name);
        let state_snapshot = snapshot_from_parts(&player_arc, &volume_arc);
        let _ = app_handle.emit("audio:state-changed", state_snapshot);

        Self::start_monitor(
            player_arc,
            volume_arc,
            preference,
            active_device_name,
            reactive_background_enabled.clone(),
            low_frequency_level.clone(),
            app_handle.clone(),
            new_monitor_stop.clone(),
        );
        Self::start_reactive_monitor(
            app_handle,
            reactive_background_enabled,
            low_frequency_level,
            new_monitor_stop,
        );
        Ok(())
    }

    pub fn play_file(
        &self,
        path: String,
        metadata: Option<SongMetadata>,
    ) -> Result<PlaybackSnapshot, String> {
        self.open_file(path, metadata, true)
    }

    pub fn load_file(
        &self,
        path: String,
        metadata: Option<SongMetadata>,
    ) -> Result<PlaybackSnapshot, String> {
        self.open_file(path, metadata, false)
    }

    pub fn pause(&self) -> Result<PlaybackSnapshot, String> {
        if let Some(handle) = self.player.lock().unwrap().as_ref() {
            handle.player.pause();
            smtc::set_playing(false);
        }
        self.low_frequency_level.reset();
        let snapshot = self.snapshot();
        if let Some(app_handle) = self.app_handle.lock().ok().and_then(|h| h.clone()) {
            let _ = app_handle.emit("audio:state-changed", snapshot.clone());
        }
        Ok(snapshot)
    }

    pub fn resume(&self) -> Result<PlaybackSnapshot, String> {
        self.low_frequency_level.reset();
        if let Some(handle) = self.player.lock().unwrap().as_ref() {
            handle.player.play();
            smtc::set_playing(true);
        }
        let snapshot = self.snapshot();
        if let Some(app_handle) = self.app_handle.lock().ok().and_then(|h| h.clone()) {
            let _ = app_handle.emit("audio:state-changed", snapshot.clone());
        }
        Ok(snapshot)
    }

    pub fn set_reactive_background_enabled(&self, enabled: bool) {
        if self
            .reactive_background_enabled
            .swap(enabled, Ordering::AcqRel)
            != enabled
        {
            self.low_frequency_level.reset();
        }
        if !enabled {
            if let Some(app_handle) = self.app_handle.lock().ok().and_then(|h| h.clone()) {
                let _ = app_handle.emit("audio:low-frequency", self.low_frequency_level.frame());
            }
        }
    }

    pub fn seek(&self, seconds: f32) -> Result<PlaybackSnapshot, String> {
        if let Some(handle) = self.player.lock().unwrap().as_ref() {
            let position = Duration::from_secs_f32(seconds.max(0.0));
            handle
                .player
                .try_seek(position)
                .map_err(|e| format!("Failed to seek audio: {}", e))?;
            let actual = handle.player.get_pos().as_secs_f32();
            smtc::set_position(actual);
        }
        let snapshot = self.snapshot();
        if let Some(app_handle) = self.app_handle.lock().ok().and_then(|h| h.clone()) {
            let _ = app_handle.emit("audio:state-changed", snapshot.clone());
        }
        Ok(snapshot)
    }

    pub fn set_volume(&self, volume: f32) {
        let clamped = volume.clamp(0.0, 1.0);
        *self.volume.lock().unwrap() = clamped;
        if let Some(handle) = self.player.lock().unwrap().as_ref() {
            handle.player.set_volume(clamped);
        }
    }

    pub fn list_outputs(&self) -> Result<Vec<AudioOutputInfo>, String> {
        let host = cpal::default_host();
        let default_id = host
            .default_output_device()
            .as_ref()
            .and_then(Self::device_id);
        let active = self.active_device_name.lock().ok().and_then(|g| g.clone());
        let devices = host
            .output_devices()
            .map_err(|e| format!("Failed to enumerate output devices: {}", e))?;
        let mut out: Vec<AudioOutputInfo> = Vec::new();
        for device in devices {
            let Some(id) = Self::device_id(&device) else {
                continue;
            };
            let Some(name) = Self::device_display_name(&device) else {
                continue;
            };
            out.push(AudioOutputInfo {
                is_system_default: default_id.as_deref() == Some(id.as_str()),
                is_active: active.as_deref() == Some(name.as_str()),
                id,
                name,
            });
        }
        Ok(out)
    }

    pub fn get_output_state(&self) -> AudioOutputState {
        let preference = match self.output_preference.lock().unwrap().clone() {
            OutputPreference::SystemDefault => None,
            OutputPreference::Pinned(name) => Some(name),
        };
        let active_device = self.active_device_name.lock().ok().and_then(|g| g.clone());
        AudioOutputState {
            preference,
            active_device,
        }
    }

    pub fn set_output_preference(&self, device: Option<String>) -> Result<(), String> {
        // Resolve the persisted/user-facing value before applying it. Output stream
        // recovery remains lock-free because WASAPI device calls may block during hot-plug.
        let previous_preference = self.output_preference.lock().unwrap().clone();
        {
            let mut lock = self.output_preference.lock().unwrap();
            *lock = match device {
                Some(value) if !value.is_empty() => {
                    // Preserve a stable endpoint ID even while that device is unplugged.
                    // Older name-based preferences are migrated whenever the device is present.
                    let id = Self::resolve_output_device_id(&value).unwrap_or(value);
                    OutputPreference::Pinned(id)
                }
                _ => OutputPreference::SystemDefault,
            };
        }

        if let Err(error) = self.swap_output_now() {
            *self.output_preference.lock().unwrap() = previous_preference;
            return Err(error);
        }
        Ok(())
    }

    fn swap_output_now(&self) -> Result<(), String> {
        let snapshot = {
            let player_lock = self.player.lock().unwrap();
            player_lock.as_ref().map(|h| {
                (
                    h.path.clone(),
                    h.metadata.clone(),
                    !h.player.is_paused(),
                    h.player.get_pos().as_secs_f32(),
                    h.monitor_stop.clone(),
                    h.session_id,
                )
            })
        };

        let Some((path, metadata, autoplay, position, monitor_stop, session_id)) = snapshot else {
            // Nothing playing right now; preference will apply on next play_file.
            if let Some(app_handle) = self.app_handle.lock().ok().and_then(|h| h.clone()) {
                Self::emit_output_changed(&app_handle, &self.active_device_name);
            }
            return Ok(());
        };

        // A failed automatic recovery may already have stopped this monitor. Manual
        // selection must still attempt a fresh swap instead of returning a false success.
        monitor_stop.store(true, Ordering::SeqCst);

        let app_handle = self
            .app_handle
            .lock()
            .ok()
            .and_then(|h| h.clone())
            .ok_or_else(|| "No app handle available".to_string())?;

        Self::recover_output_device(
            self.player.clone(),
            self.volume.clone(),
            self.output_preference.clone(),
            self.active_device_name.clone(),
            self.reactive_background_enabled.clone(),
            self.low_frequency_level.clone(),
            app_handle,
            monitor_stop,
            path,
            metadata,
            autoplay,
            position,
            session_id,
        )
    }

    pub fn get_snapshot(&self) -> PlaybackSnapshot {
        self.snapshot()
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

#[cfg(test)]
mod tests {
    use super::*;
    use core::num::NonZero;
    use rodio::buffer::SamplesBuffer;

    #[test]
    fn missing_audio_file_returns_code_without_loading_playback() {
        let state = AudioState::new();
        let path = std::env::temp_dir()
            .join(format!("simple-player-missing-{}", std::process::id()))
            .join("missing.mp3")
            .to_string_lossy()
            .into_owned();

        assert_eq!(
            state.play_file(path.clone(), None).err().as_deref(),
            Some("AUDIO_FILE_NOT_FOUND")
        );
        assert_eq!(
            state.load_file(path, None).err().as_deref(),
            Some("AUDIO_FILE_NOT_FOUND")
        );
        assert!(matches!(state.get_snapshot().status, PlaybackStatus::Idle));
    }

    #[test]
    fn low_frequency_source_preserves_pcm_and_forwards_seek() {
        let samples = vec![0.2, -0.2, 0.7, -0.7, 0.0, 0.0];
        let source = SamplesBuffer::new(
            NonZero::new(2).unwrap(),
            NonZero::new(44_100).unwrap(),
            samples.clone(),
        );
        let mut analyzed = LowFrequencySource::new(
            source,
            Arc::new(crate::modules::player::reactive::ReactiveState::new()),
        );
        assert_eq!(analyzed.by_ref().collect::<Vec<_>>(), samples);
        assert!(analyzed.try_seek(Duration::ZERO).is_ok());
    }
}
