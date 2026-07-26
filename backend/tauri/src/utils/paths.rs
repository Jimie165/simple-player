use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Local (Cache) Directory prefix
pub const CACHE_DIR_NAME: &str = "cache";
pub const COVERS_DIR: &str = "cache/covers";
pub const VIDEO_THUMBNAILS_DIR: &str = "cache/video_thumbnails";
#[allow(dead_code)]
pub const TRANSCODED_DIR: &str = "cache/transcoded";

/// Roaming (Core Data) Directory prefix
pub const DATA_DIR_NAME: &str = "data";
#[allow(dead_code)]
pub const PLAYLIST_COVERS_DIR: &str = "data/playlist_covers";

/// 判断是否为程序相对路径（缓存或用户数据）
pub fn is_app_relative_path(path: &str) -> bool {
    path.starts_with("cache/") || path.starts_with("data/")
}

/// 判断是否为用户文件绝对路径
pub fn is_user_file_path(path: &str) -> bool {
    // Windows: 盘符 (C:, D:, etc.)
    if path.len() >= 2 && path.chars().nth(1) == Some(':') {
        return true;
    }
    // Unix: 根目录
    path.starts_with('/')
}

/// 解析相对路径到绝对路径 (处理 Roaming vs Local)
pub fn resolve_app_path(app: &AppHandle, path: &str) -> Option<PathBuf> {
    if path.starts_with(CACHE_DIR_NAME) {
        // Local: e.g. "cache/covers/..." -> C:\Users\...\AppData\Local\App\cache\covers\...
        app.path().app_cache_dir().ok().map(|dir| dir.join(path))
    } else if path.starts_with(DATA_DIR_NAME) {
        // Roaming: e.g. "data/playlist_covers/..." -> C:\Users\...\AppData\Roaming\App\data\playlist_covers
        app.path().app_data_dir().ok().map(|dir| dir.join(path))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_app_relative_path() {
        assert!(is_app_relative_path("cache/covers/abc.jpg"));
        assert!(is_app_relative_path("data/playlist_covers/my.jpg"));
        assert!(!is_app_relative_path("covers/abc.jpg")); // 旧格式
        assert!(!is_app_relative_path("C:/Users/music.mp3"));
    }

    #[test]
    fn test_is_user_file_path() {
        assert!(is_user_file_path("C:/Users/music.mp3"));
        assert!(is_user_file_path("D:\\Videos\\movie.mp4"));
        assert!(is_user_file_path("/home/data/music.mp3"));
        assert!(!is_user_file_path("cache/covers/abc.jpg"));
    }
}
