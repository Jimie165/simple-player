use std::path::Path;

/// 外部程序使用平台原生路径
pub fn normalize_native_path(path: &str) -> String {
    if cfg!(target_os = "windows") {
        path.replace('/', "\\")
    } else {
        path.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_media_path_resolves_existing_file() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "simple-player-native-path-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir(&directory).unwrap();
        #[cfg(target_os = "windows")]
        let file = directory.join("中文 movie clip.mkv");
        // Unix 文件名允许反斜杠；不能把它当作 Windows 分隔符转换。
        #[cfg(not(target_os = "windows"))]
        let file = directory.join("中文 movie\\clip.mkv");
        std::fs::write(&file, b"media").unwrap();
        #[cfg(target_os = "windows")]
        let input = normalize_db_path(&file);
        #[cfg(not(target_os = "windows"))]
        let input = file.to_str().unwrap().to_string();
        let resolved = normalize_native_path(&input);
        let exists = Path::new(&resolved).is_file();
        std::fs::remove_file(&file).unwrap();
        std::fs::remove_dir(&directory).unwrap();
        assert!(exists, "Native media path no longer resolves: {resolved}");
    }
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
