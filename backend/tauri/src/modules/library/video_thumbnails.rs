use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
#[cfg(target_os = "windows")]
use windows::Storage::FileProperties::{ThumbnailMode, ThumbnailOptions};
#[cfg(target_os = "windows")]
use windows::Storage::StorageFile;
#[cfg(target_os = "windows")]
use windows::Storage::Streams::{DataReader, IInputStream};
#[cfg(target_os = "windows")]
use windows::core::HSTRING;
#[cfg(target_os = "windows")]
use windows::core::Interface;

use crate::utils::ffmpeg::resolve_ffmpeg_binary;
#[cfg(target_os = "windows")]
use crate::utils::path::normalize_native_path;
use crate::utils::paths::VIDEO_THUMBNAILS_DIR;

/// 获取视频缩略图缓存目录
fn get_thumbnails_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(VIDEO_THUMBNAILS_DIR)
}

#[cfg(target_os = "windows")]
fn extension_from_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        _ => "img",
    }
}

#[cfg(target_os = "windows")]
fn read_thumbnail_bytes(file_path: &str, requested_size: u32) -> Result<(Vec<u8>, String), String> {
    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(file_path))
        .map_err(|e| format!("GetFileFromPathAsync failed: {e}"))?
        .get()
        .map_err(|e| format!("GetFileFromPathAsync get failed: {e}"))?;

    let thumb = file
        .GetThumbnailAsync(
            ThumbnailMode::VideosView,
            requested_size,
            ThumbnailOptions::None,
        )
        .map_err(|e| format!("GetThumbnailAsync failed: {e}"))?
        .get()
        .map_err(|e| format!("GetThumbnailAsync get failed: {e}"))?;

    let mime = thumb
        .ContentType()
        .map(|h| h.to_string_lossy())
        .unwrap_or_else(|_| "application/octet-stream".to_string());

    let size = thumb.Size().unwrap_or(0) as u32;
    if size == 0 {
        return Err("empty thumbnail stream".to_string());
    }

    let input: IInputStream = thumb
        .cast()
        .map_err(|e| format!("cast thumbnail to IInputStream failed: {e}"))?;

    let reader = DataReader::CreateDataReader(&input)
        .map_err(|e| format!("CreateDataReader failed: {e}"))?;

    reader
        .LoadAsync(size)
        .map_err(|e| format!("LoadAsync failed: {e}"))?
        .get()
        .map_err(|e| format!("LoadAsync get failed: {e}"))?;

    let mut buf = vec![0u8; size as usize];
    reader
        .ReadBytes(&mut buf)
        .map_err(|e| format!("ReadBytes failed: {e}"))?;

    Ok((buf, mime))
}

/// 为视频文件生成缩略图
///
/// 首先尝试使用 Windows API（如果在 Windows 上），
/// 如果失败则回退到 FFmpeg。
///
/// 返回相对路径（如 `cache/video_thumbnails/{hash}.jpg`）
pub fn ensure_video_thumbnail(app: &AppHandle, video_path: &str) -> Result<Option<String>, String> {
    let cache_dir = crate::utils::paths::app_cache_dir(app)
        .map_err(|e| format!("app_cache_dir failed: {e}"))?;
    let thumbs_dir = get_thumbnails_dir(&cache_dir);
    fs::create_dir_all(&thumbs_dir).ok();

    let mut hasher = Sha256::new();
    hasher.update(video_path.as_bytes());
    let hash = format!("{:x}", hasher.finalize())[..16].to_string();

    // Optimization: Check if thumbnail already exists
    let common_exts = ["jpg", "png", "webp", "img", "bmp"];
    for ext in common_exts {
        let cached_path = thumbs_dir.join(format!("{}.{}", hash, ext));
        if cached_path.exists() {
            return Ok(Some(format!("{}/{}.{}", VIDEO_THUMBNAILS_DIR, hash, ext)));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let file_path = normalize_native_path(video_path);

        let (bytes, mime) = match read_thumbnail_bytes(&file_path, 512) {
            Ok(v) => v,
            Err(_) => match read_thumbnail_bytes(&file_path, 256) {
                Ok(v) => v,
                Err(_) => match read_thumbnail_bytes(&file_path, 128) {
                    Ok(v) => v,
                    Err(_) => {
                        // Fallback to ffmpeg
                        if let Some(ffmpeg_path) = resolve_ffmpeg_binary(app, "ffmpeg") {
                            let out_path_jpg = thumbs_dir.join(format!("{hash}.jpg"));
                            if generate_thumbnail_with_ffmpeg(
                                &ffmpeg_path,
                                &file_path,
                                &out_path_jpg,
                            ) {
                                return Ok(Some(format!("{}/{}.jpg", VIDEO_THUMBNAILS_DIR, hash)));
                            }
                        }
                        return Ok(None);
                    }
                },
            },
        };

        let ext = extension_from_mime(mime.as_str());
        let out_path: PathBuf = thumbs_dir.join(format!("{hash}.{ext}"));

        if !Path::new(&out_path).exists() {
            let _ = fs::write(&out_path, bytes);
        }

        Ok(Some(format!("{}/{}.{}", VIDEO_THUMBNAILS_DIR, hash, ext)))
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(ffmpeg_path) = resolve_ffmpeg_binary(app, "ffmpeg") {
            let output = thumbs_dir.join(format!("{hash}.jpg"));
            if generate_thumbnail_with_ffmpeg(&ffmpeg_path, video_path, &output) {
                return Ok(Some(format!("{}/{}.jpg", VIDEO_THUMBNAILS_DIR, hash)));
            }
        }
        Ok(None)
    }
}

fn generate_thumbnail_with_ffmpeg(ffmpeg_path: &str, input_path: &str, output_path: &Path) -> bool {
    let mut cmd = std::process::Command::new(ffmpeg_path);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let status = cmd
        .args([
            "-y",
            "-i",
            input_path,
            "-ss",
            "00:00:05.000",
            "-vframes",
            "1",
            "-q:v",
            "2",
            output_path.to_str().unwrap_or(""),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();

    match status {
        Ok(s) => s.success() && output_path.exists(),
        Err(_) => false,
    }
}
