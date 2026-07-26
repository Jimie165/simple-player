use crate::utils::path::normalize_db_path;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};
use walkdir::WalkDir;

const VIDEO_EXTENSIONS: [&str; 13] = [
    "mp4", "mkv", "avi", "mov", "webm", "flv", "m4v", "3gp", "ts", "rmvb", "wmv", "asf", "ogv",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawVideoMetadata {
    pub path: String,
    pub title: String,
    pub duration: i64,
    pub size: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<f64>,
    pub channels: Option<u8>,
}

#[derive(Deserialize)]
struct FFProbeOutput {
    streams: Vec<FFProbeStream>,
    format: Option<FFProbeFormat>,
}

#[derive(Deserialize)]
struct FFProbeStream {
    codec_type: String,
    width: Option<u32>,
    height: Option<u32>,
    avg_frame_rate: Option<String>, // "30/1" or "30000/1001"
    channels: Option<u8>,
}

#[derive(Deserialize)]
struct FFProbeFormat {
    duration: Option<String>,
}

fn has_video_extension(ext: &std::ffi::OsStr) -> bool {
    VIDEO_EXTENSIONS.iter().any(|e| ext.eq_ignore_ascii_case(e))
}

fn file_name_has_video_extension(file_name: &std::ffi::OsStr) -> bool {
    Path::new(file_name)
        .extension()
        .map(has_video_extension)
        .unwrap_or(false)
}

/// 递归扫描文件夹内的视频文件。
///
/// `ignored_dir_names` 中匹配的目录（按目录名比较，大小写不敏感）会被整个剪枝掉。
/// 根目录本身不会被剪枝，即使它的名字命中了忽略列表。
pub fn scan_video_files_recursive(dir_path: &str, ignored_dir_names: &[String]) -> Vec<String> {
    let mut video_files = Vec::new();
    let walker = WalkDir::new(dir_path).into_iter().filter_entry(|entry| {
        if entry.depth() == 0 {
            return true;
        }
        if entry.file_type().is_dir()
            && let Some(name) = entry.file_name().to_str()
        {
            let hit = ignored_dir_names
                .iter()
                .any(|ig| ig.eq_ignore_ascii_case(name));
            if hit {
                return false;
            }
        }
        true
    });
    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        if !file_name_has_video_extension(entry.file_name()) {
            continue;
        }
        video_files.push(normalize_db_path(entry.path()));
    }
    video_files.sort();
    video_files
}

pub fn is_video_file(path: &Path) -> bool {
    path.extension().map(has_video_extension).unwrap_or(false)
}

fn parse_frame_rate(fr_str: &str) -> Option<f64> {
    let parts: Vec<&str> = fr_str.split('/').collect();
    if parts.len() == 2 {
        let num: f64 = parts[0].parse().ok()?;
        let den: f64 = parts[1].parse().ok()?;
        if den != 0.0 {
            return Some(num / den);
        }
    }
    None
}

// The tuple directly represents the five optional values extracted from one ffprobe response.
#[allow(clippy::type_complexity)]
fn get_video_details_ffprobe(
    path: &str,
) -> Result<(i64, Option<u32>, Option<u32>, Option<f64>, Option<u8>), String> {
    // ffprobe -v quiet -print_format json -show_format -show_streams input.mp4
    let mut cmd = Command::new("ffprobe");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("ffprobe execution failed".to_string());
    }

    let parse_result: FFProbeOutput = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe json: {}", e))?;

    let duration = parse_result
        .format
        .and_then(|f| f.duration)
        .and_then(|d| d.parse::<f64>().ok())
        .map(|d| d.round() as i64)
        .unwrap_or(0);

    let mut width = None;
    let mut height = None;
    let mut frame_rate = None;
    let mut channels = None;

    for stream in parse_result.streams {
        if stream.codec_type == "video" {
            if width.is_none() {
                width = stream.width;
                height = stream.height;
                if let Some(fr) = stream.avg_frame_rate {
                    frame_rate = parse_frame_rate(&fr);
                }
            }
        } else if stream.codec_type == "audio" && channels.is_none() {
            channels = stream.channels;
        }
    }

    Ok((duration, width, height, frame_rate, channels))
}

pub fn get_video_metadata(path: &str) -> Result<RawVideoMetadata, String> {
    let path_obj = Path::new(path);

    // 关键修正：首先检查是否真的是视频文件
    // 防止 ffprobe 将音频文件识别成功，导致音频文件被误当作视频处理
    if !is_video_file(path_obj) {
        return Err("Not a video file extension".to_string());
    }

    let filename = path_obj
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let size = fs::metadata(path_obj).map(|m| m.len()).unwrap_or(0);

    // Get details using new JSON parser
    let (duration, width, height, frame_rate, channels) =
        get_video_details_ffprobe(path).unwrap_or((0, None, None, None, None));

    Ok(RawVideoMetadata {
        path: path.to_string(),
        title: filename,
        duration,
        size,
        width,
        height,
        frame_rate,
        channels,
    })
}
