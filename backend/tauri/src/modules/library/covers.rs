use crate::utils::paths::{COVERS_DIR, SONG_ARTWORK_DIR};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const COVER_THUMBNAIL_SIZES: [u32; 2] = [128, 512];

pub struct SongArtworkState(pub Mutex<()>);

pub struct SavedSongArtwork {
    pub relative_path: String,
}

fn ensure_cover_thumbnail(covers_dir: &Path, hash: &str, cover_bytes: &[u8], max_size: u32) {
    let thumbnail_path = covers_dir.join(format!("{}.thumb-{}.jpg", hash, max_size));
    if thumbnail_path.exists() {
        return;
    }
    let Ok(image) = image::load_from_memory(cover_bytes) else {
        return;
    };

    // 小于目标档位的原图保持其原始像素尺寸，绝不为了凑 128/512 而放大。
    let thumbnail = if image.width() <= max_size && image.height() <= max_size {
        image.to_rgb8()
    } else {
        image.thumbnail(max_size, max_size).to_rgb8()
    };
    let Ok(file) = fs::File::create(&thumbnail_path) else {
        return;
    };
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(file, 86);
    if encoder.encode_image(&thumbnail).is_err() {
        let _ = fs::remove_file(thumbnail_path);
    }
}

fn ensure_cover_thumbnail_set(covers_dir: &Path, hash: &str, cover_bytes: &[u8]) {
    for size in COVER_THUMBNAIL_SIZES {
        ensure_cover_thumbnail(covers_dir, hash, cover_bytes, size);
    }
}
/// 为旧版本已经缓存的原始封面补齐列表缩略图。
pub fn ensure_cached_cover_thumbnails(app_cache_dir: &Path) {
    let covers_dir = get_covers_dir(app_cache_dir);
    let Ok(entries) = fs::read_dir(&covers_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        if stem.contains(".thumb") {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if !matches!(
            extension.to_ascii_lowercase().as_str(),
            "jpg" | "jpeg" | "png" | "gif" | "webp"
        ) {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        ensure_cover_thumbnail_set(&covers_dir, stem, &bytes);
    }
}
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

/// 仅根据图片内容生成封面文件名哈希，让不同歌曲复用完全相同的封面缓存。
pub fn generate_cover_hash(cover_bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(cover_bytes);
    let result = hasher.finalize();
    format!("{:x}", result)[..16].to_string()
}

fn song_artwork_extension(bytes: &[u8]) -> Result<&'static str, String> {
    let format = image::guess_format(bytes).map_err(|_| "无法识别所选图片格式".to_string())?;
    image::load_from_memory_with_format(bytes, format)
        .map_err(|_| "所选文件不是有效图片".to_string())?;

    match format {
        image::ImageFormat::Jpeg => Ok("jpg"),
        image::ImageFormat::Png => Ok("png"),
        image::ImageFormat::Gif => Ok("gif"),
        image::ImageFormat::WebP => Ok("webp"),
        _ => Err("仅支持 JPG、PNG、GIF 和 WebP 图片".to_string()),
    }
}

/// 将用户选择的图片复制到持久资源目录；相同内容复用同一文件。
pub fn save_song_artwork(
    app_data_dir: &Path,
    source_path: &Path,
) -> Result<SavedSongArtwork, String> {
    let bytes = fs::read(source_path).map_err(|e| format!("读取封面失败: {e}"))?;
    let extension = song_artwork_extension(&bytes)?;
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let filename = format!("{hash}.{extension}");
    let relative_path = format!("{SONG_ARTWORK_DIR}/{filename}");
    let artwork_dir = app_data_dir.join(SONG_ARTWORK_DIR);
    fs::create_dir_all(&artwork_dir).map_err(|e| format!("创建封面目录失败: {e}"))?;

    let destination = artwork_dir.join(filename);
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
    {
        Ok(mut file) => {
            if let Err(error) = file.write_all(&bytes) {
                let _ = fs::remove_file(&destination);
                return Err(format!("保存封面失败: {error}"));
            }
        }
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
        Err(error) => return Err(format!("保存封面失败: {error}")),
    }

    Ok(SavedSongArtwork { relative_path })
}

/// 只允许清理由本应用创建的单个歌曲封面资源。
pub fn delete_song_artwork(app_data_dir: &Path, relative_path: &str) -> Result<(), String> {
    let prefix = format!("{SONG_ARTWORK_DIR}/");
    let filename = relative_path
        .strip_prefix(&prefix)
        .filter(|value| !value.is_empty() && !value.contains(['/', '\\']))
        .ok_or_else(|| "拒绝删除无效的封面资源路径".to_string())?;
    let path = app_data_dir.join(SONG_ARTWORK_DIR).join(filename);
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("清理旧封面失败: {error}")),
    }
}

fn extension_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "jpg",
    }
}

/// 保存封面到文件，返回相对路径。
/// 相同图片内容会复用缓存；图片内容变化时会生成新的缓存文件名。
pub fn save_cover_bytes(
    app_cache_dir: &Path,
    cover_bytes: &[u8],
    mime_type: &str,
) -> Option<String> {
    // 确保目录存在
    let covers_dir = match ensure_covers_dir(app_cache_dir) {
        Ok(dir) => dir,
        Err(_) => return None,
    };

    // 生成文件名
    let hash = generate_cover_hash(cover_bytes);

    // 检查是否已存在
    for ext in &["jpg", "png", "gif", "webp"] {
        let existing_path = covers_dir.join(format!("{}.{}", hash, ext));
        if existing_path.exists() {
            ensure_cover_thumbnail_set(&covers_dir, &hash, cover_bytes);
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

    ensure_cover_thumbnail_set(&covers_dir, &hash, cover_bytes);

    Some(format!("{}/{}", COVERS_DIR, filename))
}

use crate::utils::paths::resolve_app_path;
use tauri::AppHandle;

/// 获取封面的完整路径
#[allow(dead_code)]
pub fn get_cover_full_path(app: &AppHandle, cover_path: &str) -> Option<PathBuf> {
    resolve_app_path(app, cover_path)
}

/// 检查封面文件是否存在
#[allow(dead_code)]
pub fn cover_exists(app: &AppHandle, cover_path: &str) -> bool {
    get_cover_full_path(app, cover_path)
        .map(|p| p.exists())
        .unwrap_or(false)
}

/// 删除封面文件
#[allow(dead_code)]
pub fn delete_cover(app: &AppHandle, cover_path: &str) -> std::io::Result<()> {
    if let Some(full_path) = get_cover_full_path(app, cover_path)
        && full_path.exists()
    {
        fs::remove_file(full_path)?;
    }
    Ok(())
}
