use std::path::Path;

/// 将路径规范化为 Windows 格式（反斜杠）
/// 用于调用 Windows API 或外部程序（如 ffmpeg）
pub fn normalize_windows_path(path: &str) -> String {
    path.replace('/', "\\")
}

/// 将路径规范化为数据库存储格式（正斜杠）
/// 确保跨平台一致性
pub fn normalize_db_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}
