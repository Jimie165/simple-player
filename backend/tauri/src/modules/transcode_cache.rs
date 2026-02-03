use crate::modules::database::transcode_cache::TranscodeCacheRepo;
use crate::utils::path::normalize_db_path;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::time::SystemTime;

/// 计算源文件哈希（规范化路径 + 文件大小 + mtime）
pub fn compute_source_hash(path: &str) -> Result<String, String> {
    // 1. 规范化路径（统一为正斜杠、小写）
    let normalized = normalize_db_path(Path::new(path)).to_lowercase();
    
    // 2. 获取文件元数据
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let size = metadata.len();
    let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let modified_secs = modified.duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default().as_secs();
    
    // 3. 计算哈希
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    hasher.update(size.to_le_bytes());
    hasher.update(modified_secs.to_le_bytes());
    
    Ok(format!("{:x}", hasher.finalize())[..32].to_string())
}

/// 估算转码后文件大小（用于提前清理）
pub fn estimate_output_size(input_path: &str) -> Result<i64, String> {
    let metadata = fs::metadata(input_path).map_err(|e| e.to_string())?;
    // 保守估计：转码后为原文件的 1.2 倍（考虑部分格式转码后变大）
    Ok((metadata.len() as f64 * 1.2) as i64)
}

/// 确保缓存空间足够，提前清理旧文件
pub fn ensure_cache_space(
    conn: &Connection,
    app_data_dir: &Path,
    required_bytes: i64,
    max_cache_mb: i64,
) -> Result<(), String> {
    let max_bytes = max_cache_mb * 1024 * 1024;
    let mut current_size = TranscodeCacheRepo::get_total_size(conn)
        .map_err(|e| e.to_string())?;
    
    // 先清理，再转码
    while current_size + required_bytes > max_bytes {
        let oldest = TranscodeCacheRepo::get_oldest_records(conn, 1)
            .map_err(|e| e.to_string())?;
        
        if oldest.is_empty() {
            // 无可清理的记录但空间仍不足
            return Err(format!(
                "缓存空间不足，需要 {} MB，但最大限制为 {} MB",
                required_bytes / 1024 / 1024,
                max_cache_mb
            ));
        }
        
        let record = &oldest[0];
        
        // 删除物理文件
        let full_path = app_data_dir.join(&record.cache_path);
        let _ = fs::remove_file(&full_path);
        
        // 删除数据库记录
        TranscodeCacheRepo::delete(conn, record.id).map_err(|e| e.to_string())?;
        
        current_size -= record.file_size;
    }
    
    Ok(())
}

/// 查找缓存，存在则更新访问时间
pub fn get_cached_video(
    conn: &Connection,
    app_data_dir: &Path,
    source_hash: &str,
) -> Result<Option<String>, String> {
    if let Some(cache_path) = TranscodeCacheRepo::find_and_touch(conn, source_hash)
        .map_err(|e| e.to_string())? {
        
        if cache_path.is_empty() {
            // 忽略空路径（占位符）
            return Ok(None);
        }

        // 验证文件存在且是文件（非目录）
        let full_path = app_data_dir.join(&cache_path);
        if full_path.is_file() {
            return Ok(Some(full_path.to_string_lossy().to_string()));
        } else {
            // 文件被手动删除，清理数据库记录
            TranscodeCacheRepo::delete_by_hash(conn, source_hash)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(None)
}
