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
    atomic::{AtomicBool, AtomicU32, Ordering},
};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;

use super::smtc;
use crate::modules::library::SongMetadata;

#[derive(Clone, Copy, Serialize)]
struct LowFrequencyFrame {
    bass: f32,
    beat: f32,
}

fn pack_low_frequency_frame(bass: f32, beat: f32) -> u32 {
    let bass_value = (bass.clamp(0.0, 1.0) * u16::MAX as f32).round() as u32;
    let beat_value = (beat.clamp(0.0, 1.0) * u16::MAX as f32).round() as u32;
    bass_value | (beat_value << 16)
}

fn unpack_low_frequency_frame(value: u32) -> LowFrequencyFrame {
    LowFrequencyFrame {
        bass: (value & u16::MAX as u32) as f32 / u16::MAX as f32,
        beat: (value >> 16) as f32 / u16::MAX as f32,
    }
}

struct LowFrequencySource<S> {
    input: S,
    level: Arc<AtomicU32>,
    channel_count: u16,
    channel_index: u16,
    frame_sum: f32,
    low_pass: f32,
    sub_pass: f32,
    envelope: f32,
    adaptive_peak: f32,
    adaptive_floor: f32,
    output: f32,
    beat_output: f32,
    energy_sum: f32,
    energy_frames: u16,
    energy_window: u16,
    previous_energy: f32,
    flux_mean: f32,
    flux_deviation: f32,
    flux_peak: f32,
    cooldown_remaining: u8,
    cooldown_blocks: u8,
    low_alpha: f32,
    sub_alpha: f32,
    envelope_attack: f32,
    envelope_release: f32,
    peak_release: f32,
    floor_rise: f32,
    floor_release: f32,
    output_attack: f32,
    output_release: f32,
    beat_release: f32,
    analyzed_frames: u16,
}

impl<S: Source> LowFrequencySource<S> {
    fn new(input: S, level: Arc<AtomicU32>) -> Self {
        let sample_rate = input.sample_rate().get() as f32;
        Self {
            channel_count: input.channels().get(),
            input,
            level,
            channel_index: 0,
            frame_sum: 0.0,
            low_pass: 0.0,
            sub_pass: 0.0,
            envelope: 0.0,
            adaptive_peak: 0.02,
            adaptive_floor: 0.002,
            output: 0.0,
            beat_output: 0.0,
            energy_sum: 0.0,
            energy_frames: 0,
            energy_window: (sample_rate / 125.0).round().max(1.0) as u16,
            previous_energy: 0.0,
            flux_mean: 0.0,
            flux_deviation: 0.0,
            flux_peak: 0.001,
            cooldown_remaining: 0,
            cooldown_blocks: 12,
            low_alpha: 1.0 - (-2.0 * std::f32::consts::PI * 120.0 / sample_rate).exp(),
            sub_alpha: 1.0 - (-2.0 * std::f32::consts::PI * 50.0 / sample_rate).exp(),
            envelope_attack: 1.0 - (-1.0 / (sample_rate * 0.018)).exp(),
            envelope_release: 1.0 - (-1.0 / (sample_rate * 0.16)).exp(),
            peak_release: 1.0 - (-1.0 / (sample_rate * 1.8)).exp(),
            floor_rise: 1.0 - (-1.0 / (sample_rate * 0.55)).exp(),
            floor_release: 1.0 - (-1.0 / (sample_rate * 0.12)).exp(),
            output_attack: 1.0 - (-1.0 / (sample_rate * 0.08)).exp(),
            output_release: 1.0 - (-1.0 / (sample_rate * 0.28)).exp(),
            beat_release: 1.0 - (-1.0 / (sample_rate * 0.085)).exp(),
            analyzed_frames: 0,
        }
    }

    fn analyze_frame(&mut self, sample: f32) {
        self.low_pass += (sample - self.low_pass) * self.low_alpha;
        self.sub_pass += (sample - self.sub_pass) * self.sub_alpha;
        let band_sample = self.low_pass - self.sub_pass;
        let bass = band_sample.abs();
        let envelope_coefficient = if bass > self.envelope {
            self.envelope_attack
        } else {
            self.envelope_release
        };
        self.envelope += (bass - self.envelope) * envelope_coefficient;

        if self.envelope >= self.adaptive_peak {
            self.adaptive_peak = self.envelope;
        } else {
            self.adaptive_peak += (self.envelope - self.adaptive_peak) * self.peak_release;
        }
        let floor_coefficient = if self.envelope >= self.adaptive_floor {
            self.floor_rise
        } else {
            self.floor_release
        };
        self.adaptive_floor += (self.envelope - self.adaptive_floor) * floor_coefficient;

        let range = (self.adaptive_peak - self.adaptive_floor).max(0.004);
        let pulse = ((self.envelope - self.adaptive_floor) / range).clamp(0.0, 1.0);
        let body = (self.envelope / self.adaptive_peak.max(0.004)).clamp(0.0, 1.0);
        let target = (pulse * 0.30 + body * 0.70).powf(0.9);
        let output_coefficient = if target > self.output {
            self.output_attack
        } else {
            self.output_release
        };
        self.output += (target - self.output) * output_coefficient;

        self.energy_sum += band_sample * band_sample;
        self.energy_frames += 1;
        if self.energy_frames >= self.energy_window {
            let energy = (self.energy_sum / self.energy_frames as f32).sqrt();
            let flux = (energy - self.previous_energy).max(0.0);
            let threshold = (self.flux_mean + self.flux_deviation * 1.35).max(0.00015);
            if self.cooldown_remaining > 0 {
                self.cooldown_remaining -= 1;
            } else if flux > threshold && energy > self.adaptive_floor.max(0.001) {
                let available_range = (self.flux_peak - threshold).max(0.0002);
                let strength = ((flux - threshold) / available_range).clamp(0.0, 1.0);
                self.beat_output = self.beat_output.max(0.35 + strength * 0.65);
                self.cooldown_remaining = self.cooldown_blocks;
            }

            let deviation = (flux - self.flux_mean).abs();
            self.flux_mean += (flux - self.flux_mean) * 0.04;
            self.flux_deviation += (deviation - self.flux_deviation) * 0.04;
            if flux >= self.flux_peak {
                self.flux_peak = flux;
            } else {
                self.flux_peak += (flux - self.flux_peak) * 0.008;
            }
            self.previous_energy = energy;
            self.energy_sum = 0.0;
            self.energy_frames = 0;
        }
        self.beat_output += (0.0 - self.beat_output) * self.beat_release;

        self.analyzed_frames = self.analyzed_frames.wrapping_add(1);
        if self.analyzed_frames.is_multiple_of(128) {
            self.level.store(
                pack_low_frequency_frame(self.output, self.beat_output),
                Ordering::Relaxed,
            );
        }
    }
}

impl<S: Source> Iterator for LowFrequencySource<S> {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        let sample = self.input.next()?;
        self.frame_sum += sample;
        self.channel_index += 1;
        if self.channel_index >= self.channel_count {
            self.analyze_frame(self.frame_sum / self.channel_count as f32);
            self.channel_index = 0;
            self.frame_sum = 0.0;
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
        self.frame_sum = 0.0;
        self.low_pass = 0.0;
        self.sub_pass = 0.0;
        self.envelope = 0.0;
        self.adaptive_peak = 0.02;
        self.adaptive_floor = 0.002;
        self.output = 0.0;
        self.beat_output = 0.0;
        self.energy_sum = 0.0;
        self.energy_frames = 0;
        self.previous_energy = 0.0;
        self.flux_mean = 0.0;
        self.flux_deviation = 0.0;
        self.flux_peak = 0.001;
        self.cooldown_remaining = 0;
        self.level.store(0, Ordering::Relaxed);
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
}

pub struct AudioState {
    player: Arc<Mutex<Option<PlaybackHandle>>>,
    volume: Arc<Mutex<f32>>,
    output_preference: Arc<Mutex<OutputPreference>>,
    active_device_name: Arc<Mutex<Option<String>>>,
    reactive_background_enabled: Arc<AtomicBool>,
    low_frequency_level: Arc<AtomicU32>,
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
            output_preference: Arc::new(Mutex::new(OutputPreference::SystemDefault)),
            active_device_name: Arc::new(Mutex::new(None)),
            reactive_background_enabled: Arc::new(AtomicBool::new(false)),
            low_frequency_level: Arc::new(AtomicU32::new(0.0_f32.to_bits())),
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
    ) -> Result<(), String> {
        let handle = Self::build_playback_handle(
            &self.volume,
            &self.output_preference,
            &self.active_device_name,
            &self.low_frequency_level,
            path.clone(),
            metadata.clone(),
            autoplay,
            0.0,
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

        Ok(())
    }

    // Playback construction needs these synchronized state handles as one atomic setup step.
    #[allow(clippy::too_many_arguments)]
    fn build_playback_handle(
        volume: &Arc<Mutex<f32>>,
        preference: &Arc<Mutex<OutputPreference>>,
        active_device_name: &Arc<Mutex<Option<String>>>,
        low_frequency_level: &Arc<AtomicU32>,
        path: String,
        metadata: Option<SongMetadata>,
        autoplay: bool,
        start_position: f32,
    ) -> Result<PlaybackHandle, String> {
        let file = File::open(&path).map_err(|e| format!("Failed to open audio file: {}", e))?;
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
        low_frequency_level: Arc<AtomicU32>,
        app_handle: AppHandle,
        monitor_stop: Arc<AtomicBool>,
    ) {
        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_millis(250));
                if monitor_stop.load(Ordering::SeqCst) {
                    break;
                }

                let mut recovery: Option<(String, Option<SongMetadata>, bool, f32)> = None;
                let (ended, position) = {
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
                        ));
                        (false, position)
                    } else {
                        (handle.player.empty(), position)
                    }
                };

                if let Some((path, metadata, should_play, position)) = recovery {
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
                        let _ = app_handle.emit("audio:ended", ());
                    }
                    break;
                }
            }
        });
    }

    fn start_reactive_monitor(
        app_handle: AppHandle,
        enabled: Arc<AtomicBool>,
        level: Arc<AtomicU32>,
        monitor_stop: Arc<AtomicBool>,
    ) {
        thread::spawn(move || {
            while !monitor_stop.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(33));
                if enabled.load(Ordering::Relaxed) {
                    let frame = unpack_low_frequency_frame(level.load(Ordering::Relaxed));
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
        low_frequency_level: Arc<AtomicU32>,
        app_handle: AppHandle,
        expected_monitor: Arc<AtomicBool>,
        path: String,
        metadata: Option<SongMetadata>,
        autoplay: bool,
        position: f32,
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

    pub fn play_file(&self, path: String, metadata: Option<SongMetadata>) -> Result<(), String> {
        self.open_file(path, metadata, true)
    }

    pub fn load_file(&self, path: String, metadata: Option<SongMetadata>) -> Result<(), String> {
        self.open_file(path, metadata, false)
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

    pub fn set_reactive_background_enabled(&self, enabled: bool) {
        self.reactive_background_enabled
            .store(enabled, Ordering::Relaxed);
        if !enabled {
            self.low_frequency_level
                .store(0.0_f32.to_bits(), Ordering::Relaxed);
            if let Some(app_handle) = self.app_handle.lock().ok().and_then(|h| h.clone()) {
                let _ = app_handle.emit(
                    "audio:low-frequency",
                    LowFrequencyFrame {
                        bass: 0.0,
                        beat: 0.0,
                    },
                );
            }
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
                )
            })
        };

        let Some((path, metadata, autoplay, position, monitor_stop)) = snapshot else {
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
        )
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
    fn low_frequency_frame_preserves_bass_and_beat_channels() {
        let frame = unpack_low_frequency_frame(pack_low_frequency_frame(0.25, 0.75));
        let tolerance = 1.0 / u16::MAX as f32;

        assert!((frame.bass - 0.25).abs() <= tolerance);
        assert!((frame.beat - 0.75).abs() <= tolerance);
    }

    #[test]
    fn low_frequency_source_forwards_seek_to_decoder() {
        let source = SamplesBuffer::new(
            NonZero::new(1).unwrap(),
            NonZero::new(44_100).unwrap(),
            vec![0.0; 44_100],
        );
        let level = Arc::new(AtomicU32::new(0));
        let mut analyzed_source = LowFrequencySource::new(source, level);

        assert!(analyzed_source.try_seek(Duration::from_millis(500)).is_ok());
    }

    #[test]
    fn windowed_onset_detector_keeps_dense_hits_separate() {
        const SAMPLE_RATE: usize = 44_100;
        const HIT_INTERVAL: usize = SAMPLE_RATE / 8;
        let source = SamplesBuffer::new(
            NonZero::new(1).unwrap(),
            NonZero::new(SAMPLE_RATE as u32).unwrap(),
            vec![0.0; SAMPLE_RATE * 2],
        );
        let level = Arc::new(AtomicU32::new(0));
        let mut analyzed_source = LowFrequencySource::new(source, level);
        let mut peak = 0.0_f32;
        let mut valley = 1.0_f32;
        let mut pulses = Vec::new();

        for sample_index in 0..SAMPLE_RATE * 2 {
            let hit_position = sample_index % HIT_INTERVAL;
            let time = sample_index as f32 / SAMPLE_RATE as f32;
            let decay = (-(hit_position as f32) / (SAMPLE_RATE as f32 * 0.022)).exp();
            let sample = (time * 80.0 * std::f32::consts::TAU).sin() * decay;
            analyzed_source.analyze_frame(sample);
            peak = peak.max(analyzed_source.beat_output);
            valley = valley.min(analyzed_source.beat_output);

            if hit_position == HIT_INTERVAL - 1 {
                pulses.push((peak, valley));
                peak = 0.0;
                valley = 1.0;
            }
        }

        assert!(
            pulses
                .iter()
                .skip(4)
                .all(|(peak, valley)| *peak > 0.35 && *valley < *peak * 0.75),
            "dense hit pulses collapsed: {pulses:?}"
        );
    }
}
