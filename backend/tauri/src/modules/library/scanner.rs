use std::fs;
use std::path::Path;
use crate::utils::path::normalize_db_path;

/// 支持的音频格式
const AUDIO_EXTENSIONS: [&str; 5] = ["mp3", "flac", "wav", "ogg", "m4a"];

/// 扫描文件夹内的音频文件（单层）
pub fn scan_audio_files(dir_path: &str) -> Vec<String> {
    let mut audio_files = Vec::new();
    let path = Path::new(dir_path);

    if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                        if AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                            audio_files.push(normalize_db_path(&path));
                        }
                    }
                }
            }
        }
    }
    
    // 按文件名排序
    audio_files.sort();
    audio_files
}

/// 递归扫描文件夹内的音频文件
pub fn scan_audio_files_recursive(dir_path: &str) -> Vec<String> {
    let mut audio_files = Vec::new();
    scan_recursive_inner(Path::new(dir_path), &mut audio_files);
    audio_files.sort();
    audio_files
}

fn scan_recursive_inner(path: &Path, audio_files: &mut Vec<String>) {
    if !path.is_dir() {
        return;
    }

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            
            if entry_path.is_dir() {
                // 递归进入子目录
                scan_recursive_inner(&entry_path, audio_files);
            } else if entry_path.is_file() {
                if let Some(ext) = entry_path.extension().and_then(|s| s.to_str()) {
                    if AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                        audio_files.push(normalize_db_path(&entry_path));
                    }
                }
            }
        }
    }
}

/// 检查路径是否是音频文件
#[allow(dead_code)]
pub fn is_audio_file(path: &str) -> bool {
    let path = Path::new(path);
    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
        AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str())
    } else {
        false
    }
}
