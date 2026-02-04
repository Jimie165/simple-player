// 视频播放准备相关命令
// ============================================================================

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::DbState;
use crate::modules::database::TranscodeCacheRepo;
use crate::modules::transcode_cache::{compute_source_hash, estimate_output_size, ensure_cache_space, get_cached_video};
use crate::modules::hwaccel::{detect_hardware_encoder, HwAccelType};
use crate::utils::ffmpeg::resolve_ffmpeg_binary;
use super::ffprobe::{run_ffprobe_duration, run_ffprobe_video_codec, run_ffprobe_audio_codec, check_browser_compatible, try_remux};
use super::cache::get_setting;
use super::transcode::{transcode_with_hw, VideoPrepareProgress};

pub(crate) fn resolve_cache_root(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?;
    if !dir.ends_with("cache") {
        dir = dir.join("cache");
    }
    Ok(dir)
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
