#[cfg(any(target_os = "windows", test))]
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::fs;
#[cfg(any(target_os = "windows", test))]
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Clone, Serialize)]
pub struct AppDirectories {
    pub data: PathBuf,
    pub cache: PathBuf,
}

impl AppDirectories {
    /// 固定目录与应用标识分离；迁移完成后才创建 WebView，保留其本地偏好。
    pub fn initialize(app: &tauri::App) -> Result<Self, Box<dyn std::error::Error>> {
        let roaming = app.path().data_dir()?;
        #[cfg(target_os = "windows")]
        let local = app.path().local_data_dir()?;
        // macOS 的 local_data_dir 与 data_dir 相同，缓存必须使用独立目录。
        #[cfg(not(target_os = "windows"))]
        let local = app.path().cache_dir()?;
        let directories = Self {
            data: roaming.join("SimplePlayer"),
            cache: local.join("SimplePlayer"),
        };
        #[cfg(target_os = "windows")]
        migrate_app_directories(&roaming, &local, &directories)?;
        fs::create_dir_all(&directories.data)?;
        fs::create_dir_all(&directories.cache)?;
        Ok(directories)
    }
}

pub fn app_data_dir<M: Manager<tauri::Wry>>(app: &M) -> tauri::Result<PathBuf> {
    Ok(app.state::<AppDirectories>().data.clone())
}

pub fn app_cache_dir<M: Manager<tauri::Wry>>(app: &M) -> tauri::Result<PathBuf> {
    Ok(app.state::<AppDirectories>().cache.clone())
}

#[cfg(any(target_os = "windows", test))]
fn migrate_app_directories(
    roaming: &Path,
    local: &Path,
    target: &AppDirectories,
) -> Result<(), Box<dyn std::error::Error>> {
    // 缓存先迁移，数据库目录最后发布。保留旧目录，已存在的新目录不覆盖。
    copy_directory_once(&local.join("com.maho.simpleplayer"), &target.cache, false)?;
    copy_directory_once(&roaming.join("com.maho.simpleplayer"), &target.data, true)?;
    Ok(())
}

#[cfg(any(target_os = "windows", test))]
fn copy_directory_once(
    source: &Path,
    target: &Path,
    snapshot_database: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    if target.exists() || !source.exists() {
        return Ok(());
    }
    // 先复制到临时目录再重命名，避免下次启动把未完成的迁移当成有效数据。
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_nanos();
    let staging = target.with_file_name(format!(
        "SimplePlayer-migrating-{}-{timestamp}",
        std::process::id()
    ));
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        copy_directory(source, &staging, snapshot_database)?;
        let database = source.join("library.db");
        if snapshot_database && database.is_file() {
            // SQLite 自己生成一致快照，包含 WAL 中尚未 checkpoint 的提交。
            let connection =
                Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            connection.execute(
                "VACUUM INTO ?1",
                [staging.join("library.db").to_string_lossy().as_ref()],
            )?;
        }
        fs::rename(&staging, target)?;
        Ok(())
    })();
    if result.is_err() {
        // 仅清理由本次迁移创建的临时副本，旧数据保持原样。
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

#[cfg(any(target_os = "windows", test))]
fn copy_directory(source: &Path, target: &Path, snapshot_database: bool) -> io::Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let name = entry.file_name();
        if snapshot_database
            && matches!(
                name.to_str(),
                Some("library.db" | "library.db-wal" | "library.db-shm" | "library.db-journal")
            )
        {
            continue;
        }
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            return Err(io::Error::other("旧应用目录包含符号链接，无法安全迁移"));
        }
        if file_type.is_dir() {
            copy_directory(&entry.path(), &target.join(name), false)?;
        } else {
            fs::copy(entry.path(), target.join(name))?;
        }
    }
    Ok(())
}

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
pub const SONG_ARTWORK_DIR: &str = "data/song_artwork";

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
        app_cache_dir(app).ok().map(|dir| dir.join(path))
    } else if path.starts_with(DATA_DIR_NAME) {
        // Roaming: e.g. "data/playlist_covers/..." -> C:\Users\...\AppData\Roaming\App\data\playlist_covers
        app_data_dir(app).ok().map(|dir| dir.join(path))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "simple-player-paths-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn migration_preserves_wal_data_artwork_and_webview_preferences() {
        let root = TestDirectory::new();
        let roaming = root.0.join("Roaming");
        let local = root.0.join("Local");
        let old_data = roaming.join("com.maho.simpleplayer");
        let old_cache = local.join("com.maho.simpleplayer");
        fs::create_dir_all(old_data.join("data/song_artwork")).unwrap();
        fs::create_dir_all(old_cache.join("EBWebView/Default/Local Storage")).unwrap();
        fs::create_dir_all(old_cache.join("cache/covers")).unwrap();
        fs::write(old_data.join("data/song_artwork/cover.jpg"), b"artwork").unwrap();
        fs::write(old_cache.join("cache/covers/cover.jpg"), b"cover").unwrap();
        fs::write(
            old_cache.join("EBWebView/Default/Local Storage/preferences"),
            b"theme",
        )
        .unwrap();
        let connection = Connection::open(old_data.join("library.db")).unwrap();
        connection.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE settings(value TEXT); INSERT INTO settings VALUES ('saved');").unwrap();
        assert!(old_data.join("library.db-wal").exists());
        let target = AppDirectories {
            data: roaming.join("SimplePlayer"),
            cache: local.join("SimplePlayer"),
        };
        migrate_app_directories(&roaming, &local, &target).unwrap();
        let migrated = Connection::open(target.data.join("library.db")).unwrap();
        let value: String = migrated
            .query_row("SELECT value FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "saved");
        assert_eq!(
            fs::read(target.data.join("data/song_artwork/cover.jpg")).unwrap(),
            b"artwork"
        );
        assert_eq!(
            fs::read(target.cache.join("cache/covers/cover.jpg")).unwrap(),
            b"cover"
        );
        assert_eq!(
            fs::read(
                target
                    .cache
                    .join("EBWebView/Default/Local Storage/preferences")
            )
            .unwrap(),
            b"theme"
        );
        assert!(old_data.join("library.db").exists());
        assert!(old_cache.join("cache/covers/cover.jpg").exists());
        // 后续启动不得用旧设置覆盖用户在新目录中的修改。
        migrated
            .execute("UPDATE settings SET value = 'new'", [])
            .unwrap();
        migrate_app_directories(&roaming, &local, &target).unwrap();
        let value: String = migrated
            .query_row("SELECT value FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "new");
    }

    #[test]
    fn failed_migration_does_not_publish_partial_data_and_can_retry() {
        let root = TestDirectory::new();
        let source = root.0.join("old");
        let target = root.0.join("SimplePlayer");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("library.db"), b"invalid database").unwrap();
        assert!(copy_directory_once(&source, &target, true).is_err());
        assert!(!target.exists());
        fs::remove_file(source.join("library.db")).unwrap();
        let connection = Connection::open(source.join("library.db")).unwrap();
        connection
            .execute_batch("CREATE TABLE settings(value TEXT);")
            .unwrap();
        copy_directory_once(&source, &target, true).unwrap();
        assert!(target.join("library.db").is_file());
    }

    #[test]
    fn missing_legacy_directory_is_a_fresh_install() {
        let root = TestDirectory::new();
        let target = root.0.join("SimplePlayer");
        copy_directory_once(&root.0.join("missing"), &target, true).unwrap();
        assert!(!target.exists());
    }

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
