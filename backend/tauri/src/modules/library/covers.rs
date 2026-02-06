use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use crate::utils::paths::COVERS_DIR;

/// 获取封面缓存目录
pub fn get_covers_dir(app_cache_dir: &Path) -> PathBuf {
    app_cache_dir.join(COVERS_DIR)
}

/// 确保封面缓存目录存在
pub fn ensure_covers_dir(app_cache_dir: &Path) -> std::io::Result<PathBuf> {
    let covers_dir = get_covers_dir(app_cache_dir);
    fs::create_dir_all(&covers_dir)?;
    Ok(covers_dir)
}

/// 根据专辑和艺术家生成封面文件名哈希
pub fn generate_cover_hash(album: &str, artist: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(album.as_bytes());
    hasher.update(b"|");
    hasher.update(artist.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)[..16].to_string()
}

fn extension_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "jpg",
    }
}

/// 保存封面到文件，返回相对路径
/// 如果相同哈希的封面已存在，直接返回路径
pub fn save_cover_bytes(
    app_cache_dir: &Path,
    album: &str,
    artist: &str,
    cover_bytes: &[u8],
    mime_type: &str,
) -> Option<String> {
    // 确保目录存在
    let covers_dir = match ensure_covers_dir(app_cache_dir) {
        Ok(dir) => dir,
        Err(_) => return None,
    };

    // 生成文件名
    let hash = generate_cover_hash(album, artist);

    // 检查是否已存在
    for ext in &["jpg", "png", "gif", "webp"] {
        let existing_path = covers_dir.join(format!("{}.{}", hash, ext));
        if existing_path.exists() {
            // 返回相对路径（带 cache/ 前缀）
            return Some(format!("{}/{}.{}", COVERS_DIR, hash, ext));
        }
    }

    let ext = extension_from_mime(mime_type);

    // 写入文件
    let filename = format!("{}.{}", hash, ext);
    let file_path = covers_dir.join(&filename);
    
    let mut file = fs::File::create(&file_path).ok()?;
    file.write_all(cover_bytes).ok()?;

    Some(format!("{}/{}", COVERS_DIR, filename))
}

use tauri::AppHandle;
use crate::utils::paths::resolve_app_path;

/// 获取封面的完整路径
#[allow(dead_code)]
pub fn get_cover_full_path(app: &AppHandle, cover_path: &str) -> Option<PathBuf> {
    resolve_app_path(app, cover_path)
}

/// 检查封面文件是否存在
#[allow(dead_code)]
pub fn cover_exists(app: &AppHandle, cover_path: &str) -> bool {
    get_cover_full_path(app, cover_path).map(|p| p.exists()).unwrap_or(false)
}

/// 删除封面文件
#[allow(dead_code)]
pub fn delete_cover(app: &AppHandle, cover_path: &str) -> std::io::Result<()> {
    if let Some(full_path) = get_cover_full_path(app, cover_path) {
        if full_path.exists() {
            fs::remove_file(full_path)?;
        }
    }
    Ok(())
}
