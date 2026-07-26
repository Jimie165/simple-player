use crate::modules::library::SongMetadata;
use crate::utils::paths::{is_app_relative_path, resolve_app_path};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use windows::Foundation::{TimeSpan, TypedEventHandler};
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, PlaybackPositionChangeRequestedEventArgs,
    SystemMediaTransportControls, SystemMediaTransportControlsButton,
    SystemMediaTransportControlsButtonPressedEventArgs,
    SystemMediaTransportControlsTimelineProperties,
};
use windows::Storage::Streams::{
    DataWriter, InMemoryRandomAccessStream, RandomAccessStreamReference,
};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;
use windows::core::{HSTRING, factory};

struct SmtcState {
    controls: SystemMediaTransportControls,
    duration: Option<f32>,
    _button_token: i64,
    _position_token: i64,
}

static SMTC_STATE: OnceLock<Mutex<Option<SmtcState>>> = OnceLock::new();

pub fn init(app_handle: AppHandle, hwnd: Option<HWND>) {
    let state = SMTC_STATE.get_or_init(|| Mutex::new(None));
    let mut guard = state.lock().unwrap();
    if guard.is_some() {
        return;
    }

    let Some(hwnd) = hwnd else {
        return;
    };

    let Ok(interop) =
        factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()
    else {
        return;
    };

    let Ok(controls) = (unsafe { interop.GetForWindow::<SystemMediaTransportControls>(hwnd) })
    else {
        return;
    };

    let _ = controls.SetIsEnabled(true);
    let _ = controls.SetIsPlayEnabled(true);
    let _ = controls.SetIsPauseEnabled(true);
    let _ = controls.SetIsNextEnabled(true);
    let _ = controls.SetIsPreviousEnabled(true);

    let app_handle_buttons = app_handle.clone();
    let Ok(button_token) =
        controls.ButtonPressed(&TypedEventHandler::new(
            move |_,
                  args: windows::core::Ref<
                '_,
                SystemMediaTransportControlsButtonPressedEventArgs,
            >| {
                let Some(args) = args.as_ref() else {
                    return Ok(());
                };

                match args.Button()? {
                    SystemMediaTransportControlsButton::Play => {
                        let _ = app_handle_buttons.emit("smtc:play", ());
                    }
                    SystemMediaTransportControlsButton::Pause => {
                        let _ = app_handle_buttons.emit("smtc:pause", ());
                    }
                    SystemMediaTransportControlsButton::Next => {
                        let _ = app_handle_buttons.emit("smtc:next", ());
                    }
                    SystemMediaTransportControlsButton::Previous => {
                        let _ = app_handle_buttons.emit("smtc:previous", ());
                    }
                    _ => {}
                }

                Ok(())
            },
        ))
    else {
        return;
    };

    let app_handle_position = app_handle.clone();
    let Ok(position_token) = controls.PlaybackPositionChangeRequested(&TypedEventHandler::new(
        move |_, args: windows::core::Ref<'_, PlaybackPositionChangeRequestedEventArgs>| {
            let Some(args) = args.as_ref() else {
                return Ok(());
            };

            let position = args.RequestedPlaybackPosition()?;
            let seconds = (position.Duration as f32) / 10_000_000.0;
            let _ = app_handle_position.emit("smtc:seek", seconds);
            Ok(())
        },
    )) else {
        return;
    };

    *guard = Some(SmtcState {
        controls,
        duration: None,
        _button_token: button_token,
        _position_token: position_token,
    });
}

pub fn set_playing(is_playing: bool) {
    let Some(state) = SMTC_STATE.get() else {
        return;
    };
    let guard = state.lock().unwrap();
    if let Some(smtc) = guard.as_ref() {
        let status = if is_playing {
            MediaPlaybackStatus::Playing
        } else {
            MediaPlaybackStatus::Paused
        };
        let _ = smtc.controls.SetPlaybackStatus(status);
    }
}

pub fn set_position(position: f32) {
    let Some(state) = SMTC_STATE.get() else {
        return;
    };
    let guard = state.lock().unwrap();
    let Some(smtc) = guard.as_ref() else {
        return;
    };

    update_timeline(&smtc.controls, smtc.duration, position);
}

/// 将当前播放信息手动写入 Windows SMTC。
pub fn apply_metadata(
    meta: &SongMetadata,
    app_handle: Option<&AppHandle>,
) -> windows::core::Result<()> {
    let Some(state) = SMTC_STATE.get() else {
        return Ok(());
    };
    let mut guard = state.lock().unwrap();
    let Some(smtc) = guard.as_mut() else {
        return Ok(());
    };
    smtc.duration = Some(meta.duration as f32);

    let updater = smtc.controls.DisplayUpdater()?;

    // 2. 设置类型为音乐
    updater.SetType(MediaPlaybackType::Music)?;

    // 3. 设置文字信息
    let music_props = updater.MusicProperties()?;
    music_props.SetTitle(&HSTRING::from(&meta.title))?;
    music_props.SetArtist(&HSTRING::from(&meta.artist))?;
    music_props.SetAlbumTitle(&HSTRING::from(&meta.album))?;

    // 4. 设置封面
    let mut thumbnail_set = false;

    // 尝试文件路径
    if let Some(path) = &meta.cover_path {
        let resolved: Option<PathBuf> = if is_app_relative_path(path) {
            app_handle.and_then(|handle| resolve_app_path(handle, path))
        } else {
            Some(PathBuf::from(path))
        };

        if let Some(full_path) = resolved
            && let Ok(bytes) = std::fs::read(full_path)
            && let Some(stream_ref) = bytes_to_stream_ref(&bytes)
        {
            updater.SetThumbnail(&stream_ref)?;
            thumbnail_set = true;
        }
    }

    if !thumbnail_set {
        updater.SetThumbnail(None)?;
    }

    // 5. 应用修改
    updater.Update()?;
    update_timeline(&smtc.controls, smtc.duration, 0.0);

    Ok(())
}

fn update_timeline(controls: &SystemMediaTransportControls, duration: Option<f32>, position: f32) {
    let Ok(timeline) = SystemMediaTransportControlsTimelineProperties::new() else {
        return;
    };
    let end_time = seconds_to_timespan(duration.unwrap_or(position));

    let _ = timeline.SetStartTime(seconds_to_timespan(0.0));
    let _ = timeline.SetEndTime(end_time);
    let _ = timeline.SetMinSeekTime(seconds_to_timespan(0.0));
    let _ = timeline.SetMaxSeekTime(end_time);
    let _ = timeline.SetPosition(seconds_to_timespan(position));
    let _ = controls.UpdateTimelineProperties(&timeline);
}

fn seconds_to_timespan(seconds: f32) -> TimeSpan {
    TimeSpan {
        Duration: (seconds.max(0.0) * 10_000_000.0) as i64,
    }
}

/// 将字节数组转为 Windows RandomAccessStreamReference
fn bytes_to_stream_ref(bytes: &[u8]) -> Option<RandomAccessStreamReference> {
    // 1. 写入内存流
    let stream = InMemoryRandomAccessStream::new().ok()?;
    let writer = DataWriter::CreateDataWriter(&stream.GetOutputStreamAt(0).ok()?).ok()?;

    writer.WriteBytes(bytes).ok()?;
    writer.StoreAsync().ok()?;
    writer.FlushAsync().ok()?;
    writer.DetachStream().ok()?;

    // 2. 创建引用
    stream.Seek(0).ok()?;
    RandomAccessStreamReference::CreateFromStream(&stream).ok()
}
