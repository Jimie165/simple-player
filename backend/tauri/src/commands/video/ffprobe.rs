// FFprobe 工具函数
// ============================================================================

use crate::utils::path::normalize_native_path;
use std::process::Stdio;

/// 获取视频时长
pub fn run_ffprobe_duration(ffprobe: &str, input_path: &str) -> Result<Option<f64>, String> {
    let input_os = normalize_native_path(input_path);
    let mut cmd = std::process::Command::new(ffprobe);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nk=1:nw=1",
            &input_os,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(None);
    }

    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() {
        return Ok(None);
    }
    let duration = s.parse::<f64>().ok();
    Ok(duration)
}

#[derive(serde::Deserialize)]
pub struct VideoStreamInfo {
    pub codec_name: String,
    pub pix_fmt: Option<String>,
}

/// 检查实际像素格式，避免把 10 位 H.264 误判为 WebKit 可播放的视频。
pub fn is_macos_compatible_video_stream(stream: &VideoStreamInfo) -> bool {
    match stream.codec_name.as_str() {
        "h264" | "avc" => stream.pix_fmt.as_deref() == Some("yuv420p"),
        "hevc" | "h265" | "av1" => {
            matches!(stream.pix_fmt.as_deref(), Some("yuv420p" | "yuv420p10le"))
        }
        _ => false,
    }
}

/// 获取视频编码和像素格式。
pub fn run_ffprobe_video_stream(
    ffprobe: &str,
    input_path: &str,
) -> Result<Option<VideoStreamInfo>, String> {
    let input_os = normalize_native_path(input_path);
    let mut cmd = std::process::Command::new(ffprobe);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name,pix_fmt",
            "-of",
            "json",
            &input_os,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(None);
    }

    #[derive(serde::Deserialize)]
    struct ProbeOutput {
        streams: Vec<VideoStreamInfo>,
    }
    let probe: ProbeOutput =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("解析视频编码信息失败: {e}"))?;
    Ok(probe.streams.into_iter().next())
}

/// 获取音频编码格式
pub fn run_ffprobe_audio_codec(ffprobe: &str, input_path: &str) -> Result<Option<String>, String> {
    let input_os = normalize_native_path(input_path);
    let mut cmd = std::process::Command::new(ffprobe);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd
        .args([
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "default=nw=1:nk=1",
            &input_os,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(None);
    }

    let s = String::from_utf8_lossy(&output.stdout)
        .trim()
        .to_lowercase();
    if s.is_empty() {
        return Ok(None);
    }
    Ok(Some(s))
}

pub fn is_browser_compatible_video_codec(
    video_codec: &str,
    supports_hevc: bool,
    supports_av1: bool,
) -> bool {
    let hevc_ok = supports_hevc && (video_codec == "hevc" || video_codec == "h265");
    let av1_ok = supports_av1 && video_codec == "av1";

    // 只有 H.264/AVC 是广泛兼容的
    // HEVC 仅在系统支持时允许直通
    // AV1 在当前 WebView 支持时允许直通，避免高成本重编码
    video_codec == "h264" || video_codec == "avc" || hevc_ok || av1_ok
}

/// 尝试快速 remux（仅重新封装，不转码视频）
pub fn try_remux(
    ffmpeg: &str,
    input_path: &str,
    output_path: &str,
    audio_codec: Option<String>,
    supported_audio_codecs: &[String],
    video_codec: Option<&str>,
) -> Result<bool, String> {
    let input_os = normalize_native_path(input_path);
    let is_mkv = input_path.to_lowercase().ends_with(".mkv");
    // 智能 remux：只取第一个视频流(copy)和音频流(aac)，忽略其他流（如字幕）
    // 这样可以避免因字幕或特殊音轨导致的 MP4 封装失败
    let mut args: Vec<String> = vec!["-y".to_string()];
    if is_mkv {
        args.extend(vec!["-f".to_string(), "matroska".to_string()]);
    }
    args.extend(vec![
        "-i".to_string(),
        input_os.clone(),
        "-map".to_string(),
        "0:v:0".to_string(), // 仅选取第一个视频流
        "-map".to_string(),
        "0:a:0?".to_string(), // 仅选取第一个音频流（可选）
        "-c:v".to_string(),
        "copy".to_string(), // 视频流直接复制（假设已通过兼容性检查）
    ]);

    // Override logic: explicit check
    let should_copy_audio = !cfg!(target_os = "macos")
        && (matches!(audio_codec.as_deref(), Some("aac") | None)
            || (audio_codec.is_some()
                && supported_audio_codecs
                    .iter()
                    .any(|c| c == audio_codec.as_ref().unwrap())));

    if should_copy_audio {
        args.extend(vec!["-c:a".to_string(), "copy".to_string()]);
    } else {
        args.extend(vec![
            "-c:a".to_string(),
            "aac".to_string(), // 音频流转为 AAC（保证兼容性）
            "-ac".to_string(),
            "2".to_string(), // 强制双声道，减少编码开销
            "-b:a".to_string(),
            "128k".to_string(), // 降低一点码率以提升速度
        ]);
    }

    if cfg!(target_os = "macos") {
        if matches!(video_codec, Some("hevc" | "h265")) {
            args.extend(["-tag:v".to_string(), "hvc1".to_string()]);
        }
        args.extend([
            "-profile:a".to_string(),
            "aac_low".to_string(),
            "-ar".to_string(),
            "48000".to_string(),
        ]);
        args.extend(["-movflags".to_string(), "+faststart".to_string()]);
    }
    args.push(output_path.to_string());

    let mut cmd = std::process::Command::new(ffmpeg);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    // output() drains stderr while FFmpeg runs; an unread pipe can fill and hang remuxing.
    let output = cmd
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("无法启动 FFmpeg ({ffmpeg}): {e}"))?;

    if !output.status.success() {
        eprintln!(
            "FFmpeg 重封装失败: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    Ok(output.status.success())
}

#[cfg(test)]
mod tests {
    use super::{VideoStreamInfo, is_macos_compatible_video_stream};

    #[test]
    fn macos_requires_supported_chroma_and_bit_depth() {
        for (codec, pixels, expected) in [
            ("h264", "yuv420p", true),
            ("h264", "yuv420p10le", false),
            ("h264", "yuv422p", false),
            ("h264", "yuv444p", false),
            ("hevc", "yuv420p10le", true),
            ("hevc", "yuv444p10le", false),
        ] {
            let stream = VideoStreamInfo {
                codec_name: codec.into(),
                pix_fmt: Some(pixels.into()),
            };
            assert_eq!(is_macos_compatible_video_stream(&stream), expected);
        }
        assert!(!is_macos_compatible_video_stream(&VideoStreamInfo {
            codec_name: "h264".into(),
            pix_fmt: None,
        }));
    }
}
