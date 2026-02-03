use crate::DbState;
use crate::modules::database::VideoRepo; // Video struct if needed
use crate::modules::database::{FolderRepo, Video};
use crate::modules::library::video_scanner;
use crate::modules::library::video_thumbnails;
use crate::utils::ffmpeg::resolve_ffmpeg_binary;
use crate::utils::path::{normalize_db_path, normalize_windows_path};
use crate::utils::paths::TRANSCODED_DIR;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::Stdio;
use std::time::SystemTime;
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

fn cache_output_path(app: &AppHandle, input_path: &str) -> Result<(String, String), String> {
    let input_os = normalize_windows_path(input_path);
    let meta = fs::metadata(&input_os).map_err(|e| e.to_string())?;
    let size = meta.len();
    let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let modified_secs = modified
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut hasher = Sha256::new();
    hasher.update(input_path.to_lowercase().as_bytes());
    hasher.update(size.to_le_bytes());
    hasher.update(modified_secs.to_le_bytes());
    let hash = format!("{:x}", hasher.finalize());

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("app_cache_dir failed: {e}"))?
        .join(TRANSCODED_DIR);
    let _ = fs::create_dir_all(&cache_dir);

    let out_os = cache_dir.join(format!("{hash}.mp4"));
    let out_db = normalize_db_path(&out_os);
    Ok((out_os.to_string_lossy().to_string(), out_db))
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

fn try_remux(ffmpeg: &str, input_path: &str, output_path: &str) -> Result<bool, String> {
    let input_os = normalize_windows_path(input_path);
    let status = std::process::Command::new(ffmpeg)
        .args([
            "-y",
            "-i",
            &input_os,
            "-map",
            "0",
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            output_path,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|e| e.to_string())?;

    Ok(status.success())
}

fn transcode_with_progress(
    app: &AppHandle,
    ffmpeg: &str,
    input_path: &str,
    output_path: &str,
    duration: Option<f64>,
) -> Result<(), String> {
    let input_os = normalize_windows_path(input_path);

    let mut child = std::process::Command::new(ffmpeg)
        .args([
            "-y",
            "-i",
            &input_os,
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-progress",
            "pipe:1",
            "-nostats",
            output_path,
        ])
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
    let mut stderr_acc = String::new();
    let mut out_time_ms: Option<i64> = None;

    loop {
        while let Ok(line) = rx.try_recv() {
            if let Some(v) = line.strip_prefix("out_time_ms=") {
                if let Ok(ms) = v.trim().parse::<i64>() {
                    out_time_ms = Some(ms);
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
                            let _ = app.emit(
                                "video:prepare-progress",
                                VideoPrepareProgress {
                                    path: path_for_events.clone(),
                                    stage: "transcode".to_string(),
                                    percent: Some(percent),
                                    message: None,
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
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<String, String> {
    let (out_os, out_db) = cache_output_path(&app_handle, &path)?;
    if Path::new(&out_os).exists() {
        return Ok(out_db);
    }

    let ffmpeg =
        resolve_ffmpeg_binary(&app_handle, "ffmpeg").unwrap_or_else(|| "ffmpeg".to_string());
    let ffprobe =
        resolve_ffmpeg_binary(&app_handle, "ffprobe").unwrap_or_else(|| "ffprobe".to_string());

    let _ = app_handle.emit(
        "video:prepare-progress",
        VideoPrepareProgress {
            path: path.clone(),
            stage: "start".to_string(),
            percent: None,
            message: None,
        },
    );

    let duration = run_ffprobe_duration(&ffprobe, &path).unwrap_or(None);

    let remux_ok = try_remux(&ffmpeg, &path, &out_os).unwrap_or(false);
    if remux_ok && Path::new(&out_os).exists() {
        let _ = app_handle.emit(
            "video:prepare-progress",
            VideoPrepareProgress {
                path: path.clone(),
                stage: "remux".to_string(),
                percent: Some(100.0),
                message: None,
            },
        );
        return Ok(out_db);
    }

    let _ = app_handle.emit(
        "video:prepare-progress",
        VideoPrepareProgress {
            path: path.clone(),
            stage: "transcode".to_string(),
            percent: Some(0.0),
            message: None,
        },
    );

    let result = tauri::async_runtime::spawn_blocking({
        let app = app_handle.clone();
        let ffmpeg = ffmpeg.clone();
        let path = path.clone();
        let out_os = out_os.clone();
        move || transcode_with_progress(&app, &ffmpeg, &path, &out_os, duration)
    })
    .await
    .map_err(|e| e.to_string())?;

    result.map_err(|e| format!("ffmpeg transcode failed: {e}"))?;

    if !Path::new(&out_os).exists() {
        return Err("output file not created".to_string());
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

    Ok(out_db)
}
