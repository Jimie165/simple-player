use std::fs;
use std::path::Path;
use crate::utils::path::normalize_db_path;
use walkdir::WalkDir;

/// 支持的音频格式
const AUDIO_EXTENSIONS: [&str; 5] = ["mp3", "flac", "wav", "ogg", "m4a"];

fn has_audio_extension(ext: &std::ffi::OsStr) -> bool {
    AUDIO_EXTENSIONS
        .iter()
        .any(|e| ext.eq_ignore_ascii_case(e))
}

fn file_name_has_audio_extension(file_name: &std::ffi::OsStr) -> bool {
    Path::new(file_name)
        .extension()
        .map(has_audio_extension)
        .unwrap_or(false)
}

/// 扫描文件夹内的音频文件（单层）
pub fn scan_audio_files(dir_path: &str) -> Vec<String> {
    let mut audio_files = Vec::new();
    let path = Path::new(dir_path);

    if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let file_type = match entry.file_type() {
                    Ok(file_type) => file_type,
                    Err(_) => continue,
                };
                if !file_type.is_file() {
                    continue;
                }
                if !file_name_has_audio_extension(&entry.file_name()) {
                    continue;
                }
                let entry_path = entry.path();
                audio_files.push(normalize_db_path(&entry_path));
            }
        }
    }
    
    // 按文件名排序
    audio_files.sort();
    audio_files
}

/// 递归扫描文件夹内的音频文件
///
/// `ignored_dir_names` 中匹配的目录（按目录名比较，大小写不敏感）会被整个剪枝掉。
/// 根目录本身不会被剪枝，即使它的名字命中了忽略列表。
pub fn scan_audio_files_recursive(dir_path: &str, ignored_dir_names: &[String]) -> Vec<String> {
    let mut audio_files = Vec::new();
    let walker = WalkDir::new(dir_path).into_iter().filter_entry(|entry| {
        if entry.depth() == 0 {
            return true;
        }
        if entry.file_type().is_dir() {
            if let Some(name) = entry.file_name().to_str() {
                let hit = ignored_dir_names
                    .iter()
                    .any(|ig| ig.eq_ignore_ascii_case(name));
                if hit {
                    return false;
                }
            }
        }
        true
    });
    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        if !file_name_has_audio_extension(entry.file_name()) {
            continue;
        }
        audio_files.push(normalize_db_path(entry.path()));
    }
    audio_files.sort();
    audio_files
}

/// 检查路径是否是音频文件
#[allow(dead_code)]
pub fn is_audio_file(path: &str) -> bool {
    let path = Path::new(path);
    path.extension().map(has_audio_extension).unwrap_or(false)
}
