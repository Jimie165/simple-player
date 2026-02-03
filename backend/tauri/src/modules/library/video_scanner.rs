use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};
use serde::{Deserialize, Serialize};
use crate::utils::path::normalize_db_path;

const VIDEO_EXTENSIONS: [&str; 13] = ["mp4", "mkv", "avi", "mov", "webm", "flv", "m4v", "3gp", "ts", "rmvb", "wmv", "asf", "ogv"];

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

pub fn scan_video_files_recursive(dir_path: &str) -> Vec<String> {
    let mut video_files = Vec::new();
    scan_recursive_inner(Path::new(dir_path), &mut video_files);
    video_files.sort();
    video_files
}

fn scan_recursive_inner(path: &Path, video_files: &mut Vec<String>) {
    if !path.is_dir() {
        return;
    }

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();

            if entry_path.is_dir() {
                scan_recursive_inner(&entry_path, video_files);
            } else if entry_path.is_file() {
                if is_video_file(&entry_path) {
                    video_files.push(normalize_db_path(&entry_path));
                }
            }
        }
    }
}

pub fn is_video_file(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
        VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str())
    } else {
        false
    }
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

fn get_video_details_ffprobe(path: &str) -> Result<(i64, Option<u32>, Option<u32>, Option<f64>, Option<u8>), String> {
    // ffprobe -v quiet -print_format json -show_format -show_streams input.mp4
    let output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path
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

    let duration = parse_result.format
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
        } else if stream.codec_type == "audio" {
            if channels.is_none() {
                channels = stream.channels;
            }
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
    let (duration, width, height, frame_rate, channels) = get_video_details_ffprobe(path).unwrap_or((0, None, None, None, None));

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
