use base64::prelude::*;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// 获取封面缓存目录
pub fn get_covers_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("covers")
}

/// 确保封面缓存目录存在
pub fn ensure_covers_dir(app_data_dir: &Path) -> std::io::Result<PathBuf> {
    let covers_dir = get_covers_dir(app_data_dir);
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

/// 从 base64 数据 URL 中提取数据和扩展名
fn parse_data_url(data_url: &str) -> Option<(Vec<u8>, &'static str)> {
    // 格式: data:image/jpeg;base64,xxxxx
    if !data_url.starts_with("data:") {
        return None;
    }

    let parts: Vec<&str> = data_url.splitn(2, ',').collect();
    if parts.len() != 2 {
        return None;
    }

    let header = parts[0];
    let data = parts[1];

    // 解析 MIME 类型
    let ext = if header.contains("image/png") {
        "png"
    } else if header.contains("image/gif") {
        "gif"
    } else if header.contains("image/webp") {
        "webp"
    } else {
        "jpg" // 默认为 JPEG
    };

    // 解码 base64
    match BASE64_STANDARD.decode(data) {
        Ok(bytes) => Some((bytes, ext)),
        Err(_) => None,
    }
}

/// 保存封面到文件，返回相对路径
/// 如果相同哈希的封面已存在，直接返回路径
pub fn save_cover(
    app_data_dir: &Path,
    album: &str,
    artist: &str,
    cover_data: &str,
) -> Option<String> {
    // 确保目录存在
    let covers_dir = match ensure_covers_dir(app_data_dir) {
        Ok(dir) => dir,
        Err(_) => return None,
    };

    // 生成文件名
    let hash = generate_cover_hash(album, artist);

    // 检查是否已存在
    for ext in &["jpg", "png", "gif", "webp"] {
        let existing_path = covers_dir.join(format!("{}.{}", hash, ext));
        if existing_path.exists() {
            // 返回相对路径
            return Some(format!("covers/{}.{}", hash, ext));
        }
    }

    // 解析 data URL
    let (bytes, ext) = parse_data_url(cover_data)?;

    // 写入文件
    let filename = format!("{}.{}", hash, ext);
    let file_path = covers_dir.join(&filename);
    
    let mut file = fs::File::create(&file_path).ok()?;
    file.write_all(&bytes).ok()?;

    Some(format!("covers/{}", filename))
}

/// 获取封面的完整路径
#[allow(dead_code)]
pub fn get_cover_full_path(app_data_dir: &Path, cover_path: &str) -> PathBuf {
    app_data_dir.join(cover_path)
}

/// 检查封面文件是否存在
#[allow(dead_code)]
pub fn cover_exists(app_data_dir: &Path, cover_path: &str) -> bool {
    get_cover_full_path(app_data_dir, cover_path).exists()
}

/// 从文件中读取封面并转换为 data URL
#[allow(dead_code)]
pub fn read_cover_as_data_url(app_data_dir: &Path, cover_path: &str) -> Option<String> {
    let full_path = get_cover_full_path(app_data_dir, cover_path);
    let bytes = fs::read(&full_path).ok()?;
    
    // 根据扩展名确定 MIME 类型
    let ext = full_path.extension()?.to_str()?.to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };

    let b64 = BASE64_STANDARD.encode(&bytes);
    Some(format!("data:{};base64,{}", mime, b64))
}

/// 删除封面文件
#[allow(dead_code)]
pub fn delete_cover(app_data_dir: &Path, cover_path: &str) -> std::io::Result<()> {
    let full_path = get_cover_full_path(app_data_dir, cover_path);
    if full_path.exists() {
        fs::remove_file(full_path)?;
    }
    Ok(())
}
