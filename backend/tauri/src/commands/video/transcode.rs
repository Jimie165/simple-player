// 视频转码模块
// ============================================================================

use crate::modules::hwaccel::{HwAccelType, get_encode_args};
use crate::utils::path::normalize_native_path;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::Stdio;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct VideoPrepareProgress {
    pub path: String,
    pub stage: String,
    pub percent: Option<f64>,
    pub message: Option<String>,
}

/// 带硬件加速的转码函数
// These arguments mirror the FFmpeg invocation assembled by the two prepare paths.
#[allow(clippy::too_many_arguments)]
pub fn transcode_with_hw(
    app: &AppHandle,
    ffmpeg: &str,
    input_path: &str,
    output_path: &str,
    hw_type: HwAccelType,
    duration: Option<f64>,
    video_codec: Option<String>,
    prefer_hw_decode: bool,
) -> Result<(), String> {
    let input_os = normalize_native_path(input_path);
    let is_mkv = input_path.to_lowercase().ends_with(".mkv");

    // 构建编码参数
    let mut ffmpeg_args = vec!["-y".to_string()];
    let mut using_hw_decode = false;

    match hw_type {
        HwAccelType::Nvenc if prefer_hw_decode => {
            using_hw_decode = true;
            ffmpeg_args.extend(vec![
                "-hwaccel".to_string(),
                "cuda".to_string(),
                "-hwaccel_output_format".to_string(),
                "cuda".to_string(),
            ]);

            if let Some(codec) = video_codec.as_deref() {
                let decoder = match codec {
                    "h264" | "avc" => Some("h264_cuvid"),
                    "hevc" | "h265" => Some("hevc_cuvid"),
                    "av1" => Some("av1_cuvid"),
                    _ => None,
                };
                if let Some(decoder) = decoder {
                    ffmpeg_args.extend(vec!["-c:v".to_string(), decoder.to_string()]);
                }
            }
        }
        HwAccelType::Qsv if prefer_hw_decode => {
            using_hw_decode = true;
            ffmpeg_args.extend(vec![
                "-hwaccel".to_string(),
                "qsv".to_string(),
                "-hwaccel_output_format".to_string(),
                "qsv".to_string(),
            ]);

            if let Some(codec) = video_codec.as_deref() {
                let decoder = match codec {
                    "h264" | "avc" => Some("h264_qsv"),
                    "hevc" | "h265" => Some("hevc_qsv"),
                    "av1" => Some("av1_qsv"),
                    _ => None,
                };
                if let Some(decoder) = decoder {
                    ffmpeg_args.extend(vec!["-c:v".to_string(), decoder.to_string()]);
                }
            }
        }
        _ => {
            ffmpeg_args.extend(vec!["-hwaccel".to_string(), "auto".to_string()]);
        }
    }

    if !using_hw_decode {
        ffmpeg_args.extend(vec![
            "-threads".to_string(),
            "0".to_string(),
            "-thread_type".to_string(),
            "frame+slice".to_string(),
        ]);
    }

    if is_mkv {
        ffmpeg_args.extend(vec!["-f".to_string(), "matroska".to_string()]);
    }

    ffmpeg_args.extend(vec![
        "-i".to_string(),
        input_os.clone(),
        "-map".to_string(),
        "0:v:0".to_string(),
        "-map".to_string(),
        "0:a:0?".to_string(),
    ]);

    // 添加硬件编码参数
    ffmpeg_args.extend(get_encode_args(hw_type));

    if !using_hw_decode {
        ffmpeg_args.extend(vec!["-pix_fmt".to_string(), "yuv420p".to_string()]);
    }

    eprintln!(
        "[transcode_with_hw] hw_type: {:?}, hw_decode: {}, codec: {:?}",
        hw_type, using_hw_decode, video_codec
    );

    // 添加音频和容器参数
    ffmpeg_args.extend(vec![
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        "192k".to_string(),
        "-progress".to_string(),
        "pipe:1".to_string(),
        "-nostats".to_string(),
        output_path.to_string(),
    ]);

    let mut cmd = std::process::Command::new(ffmpeg);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .args(&ffmpeg_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture ffmpeg stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture ffmpeg stderr".to_string())?;

    let path_for_events = input_path.to_string();
    let (tx, rx) = std::sync::mpsc::channel::<String>();

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            let _ = tx.send(line);
        }
    });

    let (tx_err, rx_err) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            let _ = tx_err.send(line);
        }
    });

    let mut last_percent: Option<f64> = None;
    let mut last_speed: Option<String> = None;
    let mut last_fps: Option<String> = None;
    let mut stderr_acc = String::new();
    let mut out_time_ms: Option<i64> = None;

    loop {
        while let Ok(line) = rx.try_recv() {
            if let Some(v) = line.strip_prefix("out_time_ms=")
                && let Ok(ms) = v.trim().parse::<i64>()
            {
                out_time_ms = Some(ms);
            }
            if let Some(v) = line.strip_prefix("speed=") {
                let s = v.trim();
                if !s.is_empty() {
                    last_speed = Some(s.to_string());
                }
            }
            if let Some(v) = line.strip_prefix("fps=") {
                let s = v.trim();
                if !s.is_empty() {
                    last_fps = Some(s.to_string());
                }
            }
            if line.starts_with("progress=")
                && let (Some(d), Some(ms)) = (duration, out_time_ms)
                && d > 0.0
            {
                let sec = (ms as f64) / 1_000_000.0;
                let percent = (sec / d).clamp(0.0, 1.0) * 100.0;
                if last_percent
                    .map(|p| (percent - p).abs() >= 1.0)
                    .unwrap_or(true)
                {
                    last_percent = Some(percent);
                    let message = match (last_speed.as_deref(), last_fps.as_deref()) {
                        (Some(speed), Some(fps)) => Some(format!("speed {speed}, fps {fps}")),
                        (Some(speed), None) => Some(format!("speed {speed}")),
                        (None, Some(fps)) => Some(format!("fps {fps}")),
                        _ => None,
                    };
                    let _ = app.emit(
                        "video:prepare-progress",
                        VideoPrepareProgress {
                            path: path_for_events.clone(),
                            stage: "transcode".to_string(),
                            percent: Some(percent),
                            message,
                        },
                    );
                }
            }
        }

        while let Ok(line) = rx_err.try_recv() {
            if stderr_acc.len() < 8000 {
                stderr_acc.push_str(&line);
                stderr_acc.push('\n');
            }
        }

        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            if status.success() {
                return Ok(());
            }
            return Err(stderr_acc);
        }

        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}
