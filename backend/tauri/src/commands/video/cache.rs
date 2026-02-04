// 视频缓存管理命令
// ============================================================================

use std::fs;
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, State};
use crate::DbState;
use crate::modules::database::TranscodeCacheRepo;
use crate::modules::hwaccel::detect_hardware_encoder;
use crate::utils::ffmpeg::resolve_ffmpeg_binary;
use super::prepare::resolve_cache_root;

/// 缓存信息结构
#[derive(Serialize)]
pub struct TranscodeCacheInfo {
    pub total_size_mb: i64,
    pub file_count: usize,
    pub hw_accel_type: String,
    pub limit_mb: i64,
}

/// 从数据库获取设置值
pub(crate) fn get_setting(conn: &rusqlite::Connection, key: &str, default: i64) -> i64 {
    conn.query_row("SELECT value FROM app_settings WHERE key = ?", params![key], |row| row.get::<_, String>(0))
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(default)
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
