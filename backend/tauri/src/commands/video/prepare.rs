// 视频播放准备相关命令
// ============================================================================

use super::cache::{get_setting, resolve_transcoded_video_dir};
use super::ffprobe::{
    is_browser_compatible_video_codec, is_macos_compatible_video_stream, run_ffprobe_audio_codec,
    run_ffprobe_duration, run_ffprobe_video_stream, try_remux,
};
use super::transcode::{VideoPrepareProgress, transcode_with_hw};
use crate::DbState;
use crate::modules::database::TranscodeCacheRepo;
use crate::modules::hwaccel::{HwAccelType, detect_hardware_encoder};
use crate::modules::transcode_cache::{
    compute_source_hash, ensure_cache_space, estimate_output_size, get_cached_video,
};
use crate::utils::ffmpeg::resolve_ffmpeg_binary;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::async_runtime::Mutex as AsyncMutex;
use tauri::{AppHandle, Emitter, State};

type SourcePrepareMutex = AsyncMutex<()>;

static SOURCE_PREPARE_LOCKS: OnceLock<Mutex<HashMap<String, Arc<SourcePrepareMutex>>>> =
    OnceLock::new();

fn get_or_create_prepare_lock(source_hash: &str) -> Result<Arc<SourcePrepareMutex>, String> {
    let lock_map = SOURCE_PREPARE_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guards = lock_map.lock().map_err(|e| e.to_string())?;
    Ok(guards
        .entry(source_hash.to_string())
        .or_insert_with(|| Arc::new(SourcePrepareMutex::new(())))
        .clone())
}

pub(crate) fn resolve_default_cache_root(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = crate::utils::paths::app_cache_dir(app_handle).map_err(|e| e.to_string())?;
    if !dir.ends_with("cache") {
        dir = dir.join("cache");
    }
    Ok(dir)
}

fn playback_cache_hash(source_hash: &str, macos: bool) -> String {
    if !macos {
        return source_hash.to_string();
    }
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(format!("{source_hash}:macos-mp4-v2").as_bytes());
    format!("{digest:x}")[..32].to_string()
}

#[cfg(test)]
mod tests {
    use super::playback_cache_hash;

    #[test]
    fn macos_compatibility_outputs_do_not_reuse_old_or_windows_cache_files() {
        let original = "0123456789abcdef0123456789abcdef";
        assert_eq!(playback_cache_hash(original, false), original);
        let macos = playback_cache_hash(original, true);
        assert_ne!(macos, original);
        assert_ne!(&macos[..16], &original[..16]);
        assert_eq!(macos.len(), original.len());
        assert_eq!(macos, playback_cache_hash(original, true));
    }
}

#[tauri::command]
pub async fn prepare_video_for_playback(
    db: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    path: String,
    supports_hevc: bool,
    supports_av1: bool,
    supported_audio_codecs: Vec<String>,
) -> Result<String, String> {
    // 1. 计算源文件哈希
    eprintln!("[prepare_video_for_playback] 开始处理视频: {}", path);

    let ffmpeg = resolve_ffmpeg_binary(&app_handle, "ffmpeg")
        .ok_or_else(|| "应用包中未找到 FFmpeg，请重新下载完整的应用包".to_string())?;
    let ffprobe = resolve_ffmpeg_binary(&app_handle, "ffprobe")
        .ok_or_else(|| "应用包中未找到 FFprobe，请重新下载完整的应用包".to_string())?;
    // Compatibility changes must not reuse MP4 files made by the old macOS pipeline.
    let source_hash = playback_cache_hash(&compute_source_hash(&path)?, cfg!(target_os = "macos"));
    eprintln!("[prepare_video_for_playback] 源文件哈希: {}", source_hash);
    let source_prepare_lock = get_or_create_prepare_lock(&source_hash)?;
    let _prepare_guard = source_prepare_lock.lock().await;

    // 2. 获取转码 MP4 缓存目录
    let app_cache_dir = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        resolve_transcoded_video_dir(&conn, &app_handle).map_err(|e| {
            eprintln!("[prepare_video_for_playback] 获取缓存目录失败: {}", e);
            e
        })?
    };
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
        TranscodeCacheRepo::mark_in_use(&conn, &source_hash, true).map_err(|e| e.to_string())?;
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
    let cache_path = format!("{}.mp4", &source_hash[..16]);
    let temp_path = format!("{}.tmp.mp4", &source_hash[..16]);
    let cache_full_path = app_cache_dir.join(&cache_path);
    let temp_full_path = app_cache_dir.join(&temp_path);

    eprintln!(
        "[prepare_video_for_playback] 缓存文件路径: {:?}",
        cache_full_path
    );
    eprintln!(
        "[prepare_video_for_playback] 临时文件路径: {:?}",
        temp_full_path
    );

    fs::create_dir_all(cache_full_path.parent().unwrap()).map_err(|e| {
        eprintln!("[prepare_video_for_playback] 创建缓存目录失败: {}", e);
        e.to_string()
    })?;
    eprintln!("[prepare_video_for_playback] 缓存目录创建成功");

    // 7. 获取 FFmpeg
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
    let video_stream = run_ffprobe_video_stream(&ffprobe, &path).unwrap_or(None);
    let video_codec = video_stream
        .as_ref()
        .map(|stream| stream.codec_name.clone());
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
    eprintln!(
        "[prepare_video_for_playback] 前端 AV1 支持: {}",
        supports_av1
    );

    let is_compatible = video_codec
        .as_deref()
        .map(|codec| is_browser_compatible_video_codec(codec, supports_hevc, supports_av1))
        .unwrap_or(false)
        && (!cfg!(target_os = "macos")
            || video_stream
                .as_ref()
                .is_some_and(is_macos_compatible_video_stream));
    eprintln!(
        "[prepare_video_for_playback] 浏览器兼容性检查: {}",
        is_compatible
    );

    let audio_compatible = !cfg!(target_os = "macos")
        && (matches!(audio_codec.as_deref(), Some("aac") | None)
            || (audio_codec.is_some()
                && supported_audio_codecs
                    .iter()
                    .any(|c| c == audio_codec.as_ref().unwrap())));

    let codec_info = if is_compatible {
        if !audio_compatible {
            eprintln!("[prepare_video_for_playback] 视频兼容，音频需转码，执行 Remux...");
        } else {
            eprintln!("[prepare_video_for_playback] 视频/音频兼容，执行 Remux...");
        }
        if try_remux(
            &app_handle,
            &ffmpeg,
            &path,
            temp_full_path.to_str().unwrap(),
            audio_codec.clone(),
            &supported_audio_codecs,
            video_codec.as_deref(),
            duration,
        )? {
            eprintln!(
                "[prepare_video_for_playback] Remux 成功，耗时: {:?}",
                start_time.elapsed()
            );
            let _ = app_handle.emit(
                "video:prepare-progress",
                VideoPrepareProgress {
                    path: path.clone(),
                    stage: "remux".to_string(),
                    percent: Some(99.0),
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
        eprintln!(
            "[prepare_video_for_playback] 编码器检测完成: {:?}, 耗时: {:?}",
            hw_type,
            start_time.elapsed()
        );

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
            run_transcode(true).await.map_err(|e| e.to_string())?
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
            result = run_transcode(false).await.map_err(|e| e.to_string())?;
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
        .map_err(|e| e.to_string())?
        .len() as i64;

    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        // 先删除临时记录
        let _ = TranscodeCacheRepo::delete_by_hash(&conn, &source_hash);
        // 插入正式记录
        TranscodeCacheRepo::insert(
            &conn,
            &path,
            &source_hash,
            &cache_path,
            file_size,
            &codec_info,
        )
        .map_err(|e| e.to_string())?;
        // 释放使用标记
        TranscodeCacheRepo::mark_in_use(&conn, &source_hash, false).map_err(|e| e.to_string())?;
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

    eprintln!(
        "[prepare_video_for_playback] 转码完成，返回路径: {:?}",
        cache_full_path
    );
    Ok(cache_full_path.to_string_lossy().to_string())
}
