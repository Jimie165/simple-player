use crate::DbState;
use crate::modules::database::VideoRepo;
use crate::modules::database::{FolderRepo, Video, TranscodeCacheRepo};
use crate::modules::library::video_scanner;
use crate::modules::library::video_thumbnails;
use crate::modules::transcode_cache::{compute_source_hash, estimate_output_size, ensure_cache_space, get_cached_video};
use crate::modules::hwaccel::{detect_hardware_encoder, get_encode_args, HwAccelType};
use crate::utils::ffmpeg::resolve_ffmpeg_binary;
use crate::utils::path::normalize_windows_path;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::State;
use tauri::{AppHandle, Emitter, Manager};

fn scan_videos_internal(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    force_restore: bool,
    restore_folder_id: Option<i64>,
) -> Result<Vec<Video>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // 1. Get video folders only (or specific folder if restore_folder_id is provided)
    let all_folders = FolderRepo::get_by_type(&conn, "video").map_err(|e| e.to_string())?;
    let folders: Vec<_> = if let Some(folder_id) = restore_folder_id {
        all_folders
            .into_iter()
            .filter(|f| f.id == folder_id)
            .collect()
    } else {
        all_folders
    };

    // 2. Scan each folder for videos
    for folder in folders {
        let video_files = video_scanner::scan_video_files_recursive(&folder.path);

        // 3. Remove stale videos (not in scan result)
        let stale_videos = VideoRepo::get_videos_not_in_paths(&conn, folder.id, &video_files)
            .map_err(|e| e.to_string())?;

        for stale in stale_videos {
            // Soft delete (archive)
            let _ = VideoRepo::delete(&conn, stale.id);
        }

        // 4. Update/Insert videos
        for file_path in video_files {
            // Check if video exists with any status
            if let Ok(Some(existing)) = VideoRepo::get_by_path_any_status(&conn, &file_path) {
                if existing.status == "archived" {
                    let should_restore = force_restore
                        && restore_folder_id
                            .map(|target| existing.folder_id == Some(target))
                            .unwrap_or(true);

                    if should_restore {
                        // Restore the archived video
                        if let Ok(meta) = video_scanner::get_video_metadata(&file_path) {
                            let thumbnail_path =
                                video_thumbnails::ensure_video_thumbnail(&app_handle, &meta.path)?;
                            let _ = VideoRepo::upsert(
                                &conn,
                                &meta.path,
                                &meta.title,
                                meta.duration,
                                Some(meta.size as i64),
                                meta.width.map(|w| w as i32),
                                meta.height.map(|h| h as i32),
                                thumbnail_path.as_deref(),
                                Some(folder.id),
                            );
                            let _ = VideoRepo::restore(&conn, existing.id);
                        }
                    }
                }
                continue;
            }

            // New video - insert it
            if let Ok(meta) = video_scanner::get_video_metadata(&file_path) {
                let thumbnail_path =
                    video_thumbnails::ensure_video_thumbnail(&app_handle, &meta.path)?;
                let _ = VideoRepo::upsert(
                    &conn,
                    &meta.path,
                    &meta.title,
                    meta.duration,
                    Some(meta.size as i64),
                    meta.width.map(|w| w as i32),
                    meta.height.map(|h| h as i32),
                    thumbnail_path.as_deref(),
                    Some(folder.id),
                );
            }
        }
    }

    // 5. Return all active videos
    let videos = VideoRepo::get_all(&conn).map_err(|e| e.to_string())?;
    Ok(videos)
}

#[tauri::command]
pub fn scan_videos(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<Video>, String> {
    scan_videos_internal(db, app_handle, false, None)
}

/// 添加文件夹到视频库
#[tauri::command]
pub fn add_video_folder(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    folder: String,
) -> Result<Vec<Video>, String> {
    let added_folder_id = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let folder_row =
            FolderRepo::add_with_type(&conn, &folder, "video").map_err(|e| e.to_string())?;
        folder_row.id
    };

    // 添加后立即扫描：仅恢复该文件夹内已归档视频
    scan_videos_internal(db, app_handle, true, Some(added_folder_id))
}

/// 获取视频文件夹
#[tauri::command]
pub fn get_video_folders(
    db: State<'_, DbState>,
) -> Result<Vec<crate::modules::database::LibraryFolder>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let folders = FolderRepo::get_by_type(&conn, "video").map_err(|e| e.to_string())?;
    Ok(folders)
}

#[tauri::command]
pub fn get_all_videos(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<Video>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut videos = VideoRepo::get_all(&conn).map_err(|e| e.to_string())?;

    for v in &mut videos {
        let needs_thumb = match &v.thumbnail_path {
            None => true,
            Some(p) => {
                let win_path = normalize_windows_path(p);
                !Path::new(&win_path).exists()
            }
        };

        if !needs_thumb {
            continue;
        }

        let thumbnail_path = video_thumbnails::ensure_video_thumbnail(&app_handle, &v.path)?;
        if let Some(tp) = thumbnail_path {
            let _ = VideoRepo::upsert(
                &conn,
                &v.path,
                &v.title,
                v.duration,
                v.size,
                v.width,
                v.height,
                Some(tp.as_str()),
                v.folder_id,
            );
            v.thumbnail_path = Some(tp);
        }
    }
    Ok(videos)
}

/// 搜索视频
#[tauri::command]
pub fn search_videos(db: State<'_, DbState>, query: String) -> Result<Vec<Video>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let videos = VideoRepo::search(&conn, &query).map_err(|e| e.to_string())?;
    Ok(videos)
}

#[tauri::command]
pub fn toggle_video_favorite(db: State<'_, DbState>, video_id: i64) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    VideoRepo::toggle_favorite(&conn, video_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn batch_delete_videos(db: State<'_, DbState>, ids: Vec<i64>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    VideoRepo::batch_delete(&conn, &ids).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
struct VideoPrepareProgress {
    path: String,
    stage: String,
    percent: Option<f64>,
    message: Option<String>,
}

fn run_ffprobe_duration(ffprobe: &str, input_path: &str) -> Result<Option<f64>, String> {
    let input_os = normalize_windows_path(input_path);
    let output = std::process::Command::new(ffprobe)
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

fn run_ffprobe_video_codec(ffprobe: &str, input_path: &str) -> Result<Option<String>, String> {
    let input_os = normalize_windows_path(input_path);
    let output = std::process::Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
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

    let s = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
    if s.is_empty() {
        return Ok(None);
    }
    Ok(Some(s))
}

fn run_ffprobe_audio_codec(ffprobe: &str, input_path: &str) -> Result<Option<String>, String> {
    let input_os = normalize_windows_path(input_path);
    let output = std::process::Command::new(ffprobe)
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

    let s = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
    if s.is_empty() {
        return Ok(None);
    }
    Ok(Some(s))
}

fn resolve_cache_root(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?;
    if !dir.ends_with("cache") {
        dir = dir.join("cache");
    }
    Ok(dir)
}

// Helper to get setting from DB
fn get_setting(conn: &Connection, key: &str, default: i64) -> i64 {
    conn.query_row("SELECT value FROM app_settings WHERE key = ?", params![key], |row| row.get::<_, String>(0))
        .optional()
        .unwrap_or(None)
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(default)
}

/// 检查视频是否已经是浏览器兼容的格式 (H.264/AAC)
fn check_browser_compatible(
    ffprobe: &str,
    input_path: &str,
    supports_hevc: bool,
) -> Result<bool, String> {
    let input_os = normalize_windows_path(input_path);
    let output = std::process::Command::new(ffprobe)
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name",
            "-of", "default=nw=1:nk=1",
            &input_os,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| e.to_string())?;
    
    let video_codec = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
    eprintln!("[check_browser_compatible] 检测到视频编码: {}", video_codec);
    
    let hevc_ok = supports_hevc && (video_codec == "hevc" || video_codec == "h265");

    // 只有 H.264/AVC 是广泛兼容的
    // HEVC 仅在系统支持时允许直通
    Ok(video_codec == "h264" || video_codec == "avc" || hevc_ok)
}

fn try_remux(
    ffmpeg: &str,
    input_path: &str,
    output_path: &str,
    audio_codec: Option<String>,
    supported_audio_codecs: &Vec<String>,
) -> Result<bool, String> {
    let input_os = normalize_windows_path(input_path);
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
    let should_copy_audio = matches!(audio_codec.as_deref(), Some("aac") | None)
        || (audio_codec.is_some() && supported_audio_codecs.iter().any(|c| c == audio_codec.as_ref().unwrap()));

    if should_copy_audio {
        args.extend(vec!["-c:a".to_string(), "copy".to_string()]);
    } else {
        args.extend(vec![
            "-c:a".to_string(),
            "aac".to_string(), // 音频流转为 AAC（保证兼容性）
            "-ac".to_string(),
            "2".to_string(),   // 强制双声道，减少编码开销
            "-b:a".to_string(),
            "128k".to_string(), // 降低一点码率以提升速度
        ]);
    }

    args.extend(vec![
        // 本地播放不需要 faststart (moov 前置)，移除以节省大文件重写 IO 时间
        // "-movflags".to_string(),
        // "+faststart".to_string(),
        output_path.to_string(),
    ]);

    let status = std::process::Command::new(ffmpeg)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|e| e.to_string())?;

    Ok(status.success())
}



/// 带硬件加速的转码函数
fn transcode_with_hw(
    app: &AppHandle,
    ffmpeg: &str,
    input_path: &str,
    output_path: &str,
    hw_type: HwAccelType,
    duration: Option<f64>,
    video_codec: Option<String>,
    prefer_hw_decode: bool,
) -> Result<(), String> {
    let input_os = normalize_windows_path(input_path);
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
        ffmpeg_args.extend(vec![
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
        ]);
    }

    eprintln!(
        "[transcode_with_hw] hw_type: {:?}, hw_decode: {}, codec: {:?}",
        hw_type,
        using_hw_decode,
        video_codec
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

    let mut child = std::process::Command::new(ffmpeg)
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
        for line in reader.lines().flatten() {
            let _ = tx.send(line);
        }
    });

    let (tx_err, rx_err) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
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
            if let Some(v) = line.strip_prefix("out_time_ms=") {
                if let Ok(ms) = v.trim().parse::<i64>() {
                    out_time_ms = Some(ms);
                }
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
            if line.starts_with("progress=") {
                if let (Some(d), Some(ms)) = (duration, out_time_ms) {
                    if d > 0.0 {
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

#[tauri::command]
pub async fn prepare_video_for_playback(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    path: String,
    supports_hevc: bool,
    supported_audio_codecs: Vec<String>,
) -> Result<String, String> {
    // 1. 计算源文件哈希
    eprintln!("[prepare_video_for_playback] 开始处理视频: {}", path);
    // ... (lines omitted)

    // ... (This replacing is tricky because lines are far apart)
    // I should splitting this tool call.
    // First replacing the signature.

    let source_hash = compute_source_hash(&path)?;
    eprintln!("[prepare_video_for_playback] 源文件哈希: {}", source_hash);
    
    // 2. 获取缓存目录 (AppData/Local)
    let app_cache_dir = resolve_cache_root(&app_handle)
        .map_err(|e| {
            eprintln!("[prepare_video_for_playback] 获取缓存目录失败: {}", e);
            e
        })?;
    eprintln!("[prepare_video_for_playback] 缓存目录: {:?}", app_cache_dir);
    
    //3. 查找缓存
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        if let Some(cache_path) = get_cached_video(&conn, &app_cache_dir, &source_hash)? {
            eprintln!("[prepare_video_for_playback] 找到缓存: {}", cache_path);
            return Ok(cache_path);
        }
    }
    eprintln!("[prepare_video_for_playback] 未找到缓存，需要转码");
    
    // 4. 标记为正在使用（避免被清理）
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        // INSERT OR IGNORE 确保并发安全
        let _ = TranscodeCacheRepo::insert(&conn, &path, &source_hash, "", 0, "");
        TranscodeCacheRepo::mark_in_use(&conn, &source_hash, true)
            .map_err(|e| e.to_string())?;
    }
    
    // 5. 估算输出大小并提前清理
    let estimated_size = estimate_output_size(&path)?;
    let max_cache_mb = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        get_setting(&conn, "max_transcode_cache_mb", 5120)
    };
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        ensure_cache_space(&conn, &app_cache_dir, estimated_size, max_cache_mb)?;
    }
    
    // 6. 生成缓存路径（使用临时文件）
    let cache_path = format!("transcoded_videos/{}.mp4", &source_hash[..16]);
    let temp_path = format!("transcoded_videos/{}.tmp.mp4", &source_hash[..16]);
    let cache_full_path = app_cache_dir.join(&cache_path);
    let temp_full_path = app_cache_dir.join(&temp_path);
    
    eprintln!("[prepare_video_for_playback] 缓存文件路径: {:?}", cache_full_path);
    eprintln!("[prepare_video_for_playback] 临时文件路径: {:?}", temp_full_path);
    
    fs::create_dir_all(cache_full_path.parent().unwrap())
        .map_err(|e| {
            eprintln!("[prepare_video_for_playback] 创建缓存目录失败: {}", e);
            e.to_string()
        })?;
    eprintln!("[prepare_video_for_playback] 缓存目录创建成功");
    
    // 7. 获取 FFmpeg
    let ffmpeg = resolve_ffmpeg_binary(&app_handle, "ffmpeg")
        .unwrap_or_else(|| "ffmpeg".to_string());
    let ffprobe = resolve_ffmpeg_binary(&app_handle, "ffprobe")
        .unwrap_or_else(|| "ffprobe".to_string());
    eprintln!("[prepare_video_for_playback] FFmpeg: {}", ffmpeg);
    eprintln!("[prepare_video_for_playback] FFprobe: {}", ffprobe);
    
    let _ = app_handle.emit(
        "video:prepare-progress",
        VideoPrepareProgress {
            path: path.clone(),
            stage: "start".to_string(),
            percent: None,
            message: None,
        },
    );
    
    // 8. 获取视频时长
    let duration = run_ffprobe_duration(&ffprobe, &path).unwrap_or(None);
    let video_codec = run_ffprobe_video_codec(&ffprobe, &path).unwrap_or(None);
    let audio_codec = run_ffprobe_audio_codec(&ffprobe, &path).unwrap_or(None);
    if let Some(codec) = &video_codec {
        eprintln!("[prepare_video_for_playback] 视频编码: {}", codec);
    }
    if let Some(codec) = &audio_codec {
        eprintln!("[prepare_video_for_playback] 音频编码: {}", codec);
    }
    
    // 9. 检查是否需要转码
    let start_time = std::time::Instant::now();
    eprintln!(
        "[prepare_video_for_playback] 前端 HEVC 支持: {}",
        supports_hevc
    );

    let is_compatible = check_browser_compatible(&ffprobe, &path, supports_hevc)
        .map(|compatible| {
            eprintln!("[prepare_video_for_playback] 浏览器兼容性检查: {}", compatible);
            compatible
        })
        .unwrap_or_else(|e| {
            eprintln!("[prepare_video_for_playback] 兼容性检查失败: {}", e);
            false
        });
    
    let audio_compatible = matches!(audio_codec.as_deref(), Some("aac") | None)
        || (audio_codec.is_some() && supported_audio_codecs.iter().any(|c| c == audio_codec.as_ref().unwrap()));

    let codec_info = if is_compatible {
        if !audio_compatible {
            eprintln!("[prepare_video_for_playback] 视频兼容，音频需转码，执行 Remux...");
        } else {
            eprintln!("[prepare_video_for_playback] 视频/音频兼容，执行 Remux...");
        }
        if try_remux(
            &ffmpeg,
            &path,
            temp_full_path.to_str().unwrap(),
            audio_codec.clone(),
            &supported_audio_codecs,
        )? {
             eprintln!("[prepare_video_for_playback] Remux 成功，耗时: {:?}", start_time.elapsed());
             let _ = app_handle.emit(
                "video:prepare-progress",
                VideoPrepareProgress {
                    path: path.clone(),
                    stage: "remux".to_string(),
                    percent: Some(100.0),
                    message: Some("重新封装为 MP4".to_string()),
                },
            );
            "remux".to_string()
        } else {
             eprintln!("[prepare_video_for_playback] Remux 失败，转为全量转码");
             "transcode".to_string() // Fallthrough
        }
    } else {
        eprintln!("[prepare_video_for_playback] 格式不兼容，需要全量转码");
        "transcode".to_string()
    };
    
    let codec_info = if codec_info == "transcode" {
        // 检测硬件加速
        let hw_type = detect_hardware_encoder(&ffmpeg);
        eprintln!("[prepare_video_for_playback] 编码器检测完成: {:?}, 耗时: {:?}", hw_type, start_time.elapsed());
        
        let _ = app_handle.emit(
            "video:prepare-progress",
            VideoPrepareProgress {
                path: path.clone(),
                stage: "transcode".to_string(),
                percent: Some(0.0),
                message: Some(format!("使用 {} 编码", hw_type)),
            },
        );
        
        // 先尝试硬件编码
        let run_transcode = |prefer_hw_decode: bool| {
            tauri::async_runtime::spawn_blocking({
                let app = app_handle.clone();
                let ffmpeg = ffmpeg.clone();
                let path = path.clone();
                let output = temp_full_path.to_str().unwrap().to_string();
                let video_codec = video_codec.clone();
                move || {
                    transcode_with_hw(
                        &app,
                        &ffmpeg,
                        &path,
                        &output,
                        hw_type,
                        duration,
                        video_codec,
                        prefer_hw_decode,
                    )
                }
            })
        };

        let mut result = if hw_type != HwAccelType::None {
            run_transcode(true)
                .await
                .map_err(|e| e.to_string())?
        } else {
            Err("跳过硬件加速".to_string())
        };

        if result.is_err() && hw_type != HwAccelType::None {
            let _ = app_handle.emit(
                "video:prepare-progress",
                VideoPrepareProgress {
                    path: path.clone(),
                    stage: "transcode".to_string(),
                    percent: Some(0.0),
                    message: Some(format!("{hw_type} 硬件解码失败，尝试仅硬件编码")),
                },
            );
            result = run_transcode(false)
                .await
                .map_err(|e| e.to_string())?;
        }
        
        // 硬件失败时降级到软件编码
        if result.is_err() {
            let _ = app_handle.emit(
                "video:prepare-progress",
                VideoPrepareProgress {
                    path: path.clone(),
                    stage: "transcode".to_string(),
                    percent: Some(0.0),
                    message: Some("硬件编码失败，降级到软件编码".to_string()),
                },
            );
            
            tauri::async_runtime::spawn_blocking({
                let app = app_handle.clone();
                let ffmpeg = ffmpeg.clone();
                let path = path.clone();
                let output = temp_full_path.to_str().unwrap().to_string();
                move || {
                    transcode_with_hw(
                        &app,
                        &ffmpeg,
                        &path,
                        &output,
                        HwAccelType::None,
                        duration,
                        None,
                        false,
                    )
                }
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("软件编码失败: {}", e))?;
            
            "software".to_string()
        } else {
            hw_type.to_string()
        }
    } else {
        codec_info
    };
    
    // 10. 原子性重命名（确保文件完整）
    fs::rename(&temp_full_path, &cache_full_path)
        .map_err(|e| format!("重命名缓存文件失败: {}", e))?;
    
    // 11. 添加到数据库
    let file_size = fs::metadata(&cache_full_path)
        .map_err(|e| e.to_string())?.len() as i64;
    
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        // 先删除临时记录
        let _ = TranscodeCacheRepo::delete_by_hash(&conn, &source_hash);
        // 插入正式记录
        TranscodeCacheRepo::insert(&conn, &path, &source_hash, &cache_path, file_size, &codec_info)
            .map_err(|e| e.to_string())?;
        // 释放使用标记
        TranscodeCacheRepo::mark_in_use(&conn, &source_hash, false)
            .map_err(|e| e.to_string())?;
    }
    
    let _ = app_handle.emit(
        "video:prepare-progress",
        VideoPrepareProgress {
            path: path.clone(),
            stage: "done".to_string(),
            percent: Some(100.0),
            message: None,
        },
    );
    
    eprintln!("[prepare_video_for_playback] 转码完成，返回路径: {:?}", cache_full_path);
    Ok(cache_full_path.to_string_lossy().to_string())
}

/// 缓存信息结构
#[derive(Serialize)]
pub struct TranscodeCacheInfo {
    pub total_size_mb: i64,
    pub file_count: usize,
    pub hw_accel_type: String,
    pub limit_mb: i64,
}

/// 获取转码缓存信息
#[tauri::command]
pub fn get_transcode_cache_info(
    db: State<'_, DbState>,
    app_handle: AppHandle,
) -> Result<TranscodeCacheInfo, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let total_size = TranscodeCacheRepo::get_total_size(&conn)
        .map_err(|e| e.to_string())?;
    let count = TranscodeCacheRepo::get_count(&conn)
        .map_err(|e| e.to_string())?;
    
    let ffmpeg = resolve_ffmpeg_binary(&app_handle, "ffmpeg")
        .unwrap_or_else(|| "ffmpeg".to_string());
    let hw_type = detect_hardware_encoder(&ffmpeg);
    
    let current_limit = get_setting(&conn, "max_transcode_cache_mb", 5120);
    
    Ok(TranscodeCacheInfo {
        total_size_mb: total_size / 1024 / 1024,
        file_count: count,
        hw_accel_type: hw_type.to_string(),
        limit_mb: current_limit,
    })
}

/// 清空转码缓存（安全删除，仅删除未使用的）
#[tauri::command]
pub fn clear_transcode_cache(
    db: State<'_, DbState>,
    app_handle: AppHandle,
) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let app_cache_dir = resolve_cache_root(&app_handle)?;
    
    // 获取所有未使用的记录
    let to_delete: Vec<String> = conn.prepare(
        "SELECT cache_path FROM transcoded_cache WHERE is_in_use = 0"
    )
    .map_err(|e| e.to_string())?
    .query_map([], |row| row.get::<_, String>(0))
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;
    
    // 删除物理文件
    for cache_path in &to_delete {
        let full_path = app_cache_dir.join(cache_path);
        let _ = fs::remove_file(&full_path);
    }
    
    // 清空数据库记录
    let count = TranscodeCacheRepo::clear_unused(&conn)
        .map_err(|e| e.to_string())?;
    
    Ok(count)
}

/// 设置转码缓存限制 (MB)
#[tauri::command]
pub fn set_transcode_cache_limit(
    db: State<'_, DbState>,
    limit_mb: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch())",
        params!["max_transcode_cache_mb", limit_mb.to_string()],
    )
    .map_err(|e| e.to_string())?;
    
    Ok(())
}
