// 视频缓存管理命令
// ============================================================================

use std::fs;
use std::path::{Path, PathBuf};
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, State};
use crate::DbState;
use crate::modules::database::TranscodeCacheRepo;
use crate::modules::hwaccel::{HwAccelType, cached_hardware_encoder, start_hardware_encoder_detection};
use crate::modules::transcode_cache::resolve_cache_file_path;
use crate::utils::ffmpeg::resolve_ffmpeg_binary;

/// 缓存信息结构
#[derive(Serialize)]
pub struct TranscodeCacheInfo {
    pub total_size_mb: i64,
    pub file_count: usize,
    pub hw_accel_type: String,
    pub limit_mb: i64,
    pub cache_dir: String,
    pub default_cache_dir: String,
    pub is_custom_cache_dir: bool,
}

const TRANSCODE_CACHE_DIR_KEY: &str = "transcoded_video_dir";
const LEGACY_TRANSCODE_CACHE_ROOT_KEY: &str = "transcode_cache_dir";

/// 从数据库获取设置值
pub(crate) fn get_setting(conn: &rusqlite::Connection, key: &str, default: i64) -> i64 {
    conn.query_row("SELECT value FROM app_settings WHERE key = ?", params![key], |row| row.get::<_, String>(0))
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(default)
}

pub(crate) fn get_setting_string(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM app_settings WHERE key = ?", params![key], |row| row.get::<_, String>(0))
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub(crate) fn set_setting_string(
    conn: &rusqlite::Connection,
    key: &str,
    value: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch())",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn delete_setting(conn: &rusqlite::Connection, key: &str) -> Result<(), String> {
    conn.execute("DELETE FROM app_settings WHERE key = ?", params![key])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn default_transcoded_video_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    Ok(super::prepare::resolve_default_cache_root(app_handle)?.join("transcoded_videos"))
}

pub(crate) fn resolve_transcoded_video_dir(
    conn: &rusqlite::Connection,
    app_handle: &AppHandle,
) -> Result<PathBuf, String> {
    if let Some(path) = get_setting_string(conn, TRANSCODE_CACHE_DIR_KEY) {
        return Ok(PathBuf::from(path));
    }
    if let Some(path) = get_setting_string(conn, LEGACY_TRANSCODE_CACHE_ROOT_KEY) {
        return Ok(PathBuf::from(path).join("transcoded_videos"));
    }
    default_transcoded_video_dir(app_handle)
}

fn normalize_cache_dir(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("缓存目录不能为空".to_string());
    }

    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return Err("请选择一个绝对路径作为缓存目录".to_string());
    }

    Ok(path.to_path_buf())
}

fn cleanup_missing_cache_records(
    conn: &rusqlite::Connection,
    cache_root: &Path,
) -> Result<(), String> {
    let records = TranscodeCacheRepo::get_unused_records(conn)
        .map_err(|e| e.to_string())?;

    for record in records {
        if record.cache_path.is_empty()
            || !resolve_cache_file_path(cache_root, &record.cache_path).is_file()
        {
            TranscodeCacheRepo::delete(conn, record.id).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn move_existing_cache_files(
    conn: &rusqlite::Connection,
    from_root: &Path,
    to_root: &Path,
) -> Result<(), String> {
    if from_root == to_root {
        return Ok(());
    }

    let records = TranscodeCacheRepo::get_unused_records(conn)
        .map_err(|e| e.to_string())?;

    for record in records {
        if record.cache_path.is_empty() {
            continue;
        }

        let from = resolve_cache_file_path(from_root, &record.cache_path);
        if !from.is_file() {
            continue;
        }

        let file_name = match Path::new(&record.cache_path).file_name() {
            Some(file_name) => file_name,
            None => continue,
        };
        let to = to_root.join(file_name);
        if to.is_file() {
            let _ = fs::remove_file(&from);
            continue;
        }

        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建缓存目录失败: {}", e))?;
        }

        if let Err(rename_err) = fs::rename(&from, &to) {
            fs::copy(&from, &to)
                .map_err(|copy_err| format!("迁移缓存失败: {}; {}", rename_err, copy_err))?;
            let _ = fs::remove_file(&from);
        }
    }

    Ok(())
}

/// 获取转码缓存信息
#[tauri::command]
pub fn get_transcode_cache_info(
    db: State<'_, DbState>,
    app_handle: AppHandle,
) -> Result<TranscodeCacheInfo, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let default_cache_dir = default_transcoded_video_dir(&app_handle)?;
    let custom_cache_dir = get_setting_string(&conn, TRANSCODE_CACHE_DIR_KEY);
    let cache_dir = custom_cache_dir
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| default_cache_dir.clone());
    cleanup_missing_cache_records(&conn, &cache_dir)?;

    let total_size = TranscodeCacheRepo::get_total_size(&conn)
        .map_err(|e| e.to_string())?;
    let count = TranscodeCacheRepo::get_count(&conn)
        .map_err(|e| e.to_string())?;
    
    let ffmpeg = resolve_ffmpeg_binary(&app_handle, "ffmpeg")
        .unwrap_or_else(|| "ffmpeg".to_string());
    // 硬件检测会启动 FFmpeg 并实际编码一秒测试视频。不能让设置页等待它完成。
    let hw_type = cached_hardware_encoder().unwrap_or_else(|| {
        start_hardware_encoder_detection(app_handle.clone(), ffmpeg);
        HwAccelType::Detecting
    });
    
    let current_limit = get_setting(&conn, "max_transcode_cache_mb", 5120);
    
    Ok(TranscodeCacheInfo {
        total_size_mb: total_size / 1024 / 1024,
        file_count: count,
        hw_accel_type: hw_type.to_string(),
        limit_mb: current_limit,
        cache_dir: cache_dir.to_string_lossy().to_string(),
        default_cache_dir: default_cache_dir.to_string_lossy().to_string(),
        is_custom_cache_dir: custom_cache_dir.is_some(),
    })
}

/// 清空转码缓存（安全删除，仅删除未使用的）
#[tauri::command]
pub fn clear_transcode_cache(
    db: State<'_, DbState>,
    app_handle: AppHandle,
) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let app_cache_dir = resolve_transcoded_video_dir(&conn, &app_handle)?;
    
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
        let full_path = resolve_cache_file_path(&app_cache_dir, cache_path);
        let _ = fs::remove_file(&full_path);
    }
    if let Ok(entries) = fs::read_dir(&app_cache_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && matches!(
                    path.extension().and_then(|ext| ext.to_str()),
                    Some("mp4")
                )
            {
                let _ = fs::remove_file(path);
            }
        }
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

/// 设置转码缓存位置。传 null/空字符串恢复默认位置。
#[tauri::command]
pub fn set_transcode_cache_dir(
    db: State<'_, DbState>,
    app_handle: AppHandle,
    cache_dir: Option<String>,
) -> Result<TranscodeCacheInfo, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let old_dir = resolve_transcoded_video_dir(&conn, &app_handle)?;

    let next_dir = cache_dir
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(normalize_cache_dir)
        .transpose()?;

    let target_dir = if let Some(dir) = &next_dir {
        fs::create_dir_all(dir).map_err(|e| format!("创建缓存目录失败: {}", e))?;
        let test_dir = dir.join(".simple-player-cache-test");
        fs::create_dir_all(&test_dir).map_err(|e| format!("缓存目录不可写: {}", e))?;
        let _ = fs::remove_dir(&test_dir);
        dir.clone()
    } else {
        let dir = default_transcoded_video_dir(&app_handle)?;
        fs::create_dir_all(&dir).map_err(|e| format!("创建缓存目录失败: {}", e))?;
        dir
    };

    move_existing_cache_files(&conn, &old_dir, &target_dir)?;

    if let Some(dir) = &next_dir {
        set_setting_string(
            &conn,
            TRANSCODE_CACHE_DIR_KEY,
            &dir.to_string_lossy(),
        )?;
        delete_setting(&conn, LEGACY_TRANSCODE_CACHE_ROOT_KEY)?;
    } else {
        delete_setting(&conn, TRANSCODE_CACHE_DIR_KEY)?;
        delete_setting(&conn, LEGACY_TRANSCODE_CACHE_ROOT_KEY)?;
    }

    drop(conn);
    get_transcode_cache_info(db, app_handle)
}
