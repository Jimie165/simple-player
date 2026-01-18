use std::fs;
use std::path::Path;

// 支持的音频格式
const AUDIO_EXTENSIONS: [&str; 6] = ["mp3", "flac", "wav", "ogg", "m4a", "mp4"];

pub fn scan_audio_files(dir_path: &str) -> Vec<String> {
    let mut audio_files = Vec::new();
    let path = Path::new(dir_path);

    if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let path = entry.path();
                // 这里只做单层扫描（如需递归可改为递归调用，但通常专辑都在一层）
                if path.is_file() {
                    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                        if AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                            // 转换为 String 并规范化路径分隔符
                            if let Some(path_str) = path.to_str() {
                                audio_files.push(path_str.replace('\\', "/"));
                            }
                        }
                    }
                }
            }
        }
    }
    // 按文件名排序，保证播放顺序
    audio_files.sort();
    audio_files
}
