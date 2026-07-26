use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[cfg(all(target_os = "windows", target_arch = "x86_64", target_env = "msvc"))]
const WINDOWS_TARGET_TRIPLE: &str = "x86_64-pc-windows-msvc";
#[cfg(all(target_os = "windows", target_arch = "x86_64", target_env = "gnu"))]
const WINDOWS_TARGET_TRIPLE: &str = "x86_64-pc-windows-gnu";
#[cfg(all(target_os = "windows", target_arch = "aarch64", target_env = "msvc"))]
const WINDOWS_TARGET_TRIPLE: &str = "aarch64-pc-windows-msvc";
#[cfg(not(any(
    all(target_os = "windows", target_arch = "x86_64", target_env = "msvc"),
    all(target_os = "windows", target_arch = "x86_64", target_env = "gnu"),
    all(target_os = "windows", target_arch = "aarch64", target_env = "msvc")
)))]
const WINDOWS_TARGET_TRIPLE: &str = "x86_64-pc-windows-msvc";

fn windows_target_triple() -> &'static str {
    WINDOWS_TARGET_TRIPLE
}

/// 解析 ffmpeg 系列二进制文件路径
///
/// 按优先级顺序查找：
/// 1. 可执行文件所在目录
/// 2. CARGO_MANIFEST_DIR/binaries (开发环境)
/// 3. 当前工作目录/binaries
/// 4. Tauri resource_dir
///
/// # 参数
/// - `app`: Tauri AppHandle
/// - `base_name`: 二进制文件基础名称（如 "ffmpeg" 或 "ffprobe"）
///
/// # 返回
/// 找到的二进制文件完整路径，如果未找到则返回 None
pub fn resolve_ffmpeg_binary(app: &AppHandle, base_name: &str) -> Option<String> {
    let ext = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    let current_exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));

    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. 可执行文件目录
    if let Some(dir) = current_exe_dir {
        candidates.push(dir.join(format!("{base_name}{ext}")));
    }

    // 2. 开发环境 binaries 目录（带平台标识）
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest_dir.join("binaries").join(format!(
        "{base_name}-{}{}",
        windows_target_triple(),
        ext
    )));
    candidates.push(
        manifest_dir
            .join("binaries")
            .join(format!("{base_name}{ext}")),
    );

    // 3. 当前工作目录 binaries
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("binaries").join(format!(
            "{base_name}-{}{}",
            windows_target_triple(),
            ext
        )));
        candidates.push(cwd.join("binaries").join(format!("{base_name}{ext}")));
    }

    // 4. Tauri resource 目录（生产环境）
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(format!("{base_name}{ext}")));
        candidates.push(
            resource_dir
                .join("binaries")
                .join(format!("{base_name}{ext}")),
        );
    }

    // 查找第一个存在的候选路径
    for p in candidates {
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }

    None
}
