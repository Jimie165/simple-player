use std::path::Path;

/// 将路径规范化为 Windows 格式（反斜杠）
/// 用于调用 Windows API 或外部程序（如 ffmpeg）
#[cfg(target_os = "windows")]
pub fn normalize_windows_path(path: &str) -> String {
    path.replace('/', "\\")
}

/// 将路径规范化为数据库存储格式（正斜杠）
/// 确保跨平台一致性
pub fn normalize_db_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// 将文件夹路径规范化为数据库存储格式
/// - 反斜杠转正斜杠
/// - 去掉末尾的斜杠（保留盘符根，如 "D:/"）
pub fn normalize_folder_path(path: &str) -> String {
    let unified = path.replace('\\', "/");
    let trimmed = unified.trim_end_matches('/');
    if trimmed.is_empty() {
        // 路径是 "/" 或全部由斜杠组成，保留单个斜杠
        "/".to_string()
    } else if trimmed.len() == 2 && trimmed.ends_with(':') {
        // 形如 "D:" -> "D:/"，避免和"当前目录的 D:"冲突
        format!("{}/", trimmed)
    } else {
        trimmed.to_string()
    }
}
