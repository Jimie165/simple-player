use rusqlite::{Connection, Result};

/// 当前数据库版本
const SCHEMA_VERSION: i32 = 14;

/// 获取当前数据库版本
fn get_db_version(conn: &Connection) -> Result<i32> {
    // 尝试查询版本表
    let result: Result<i32> = conn.query_row(
        "SELECT version FROM schema_version ORDER BY id DESC LIMIT 1",
        [],
        |row| row.get(0),
    );

    match result {
        Ok(version) => Ok(version),
        Err(_) => Ok(0), // 表不存在或无数据，返回版本 0
    }
}

/// 设置数据库版本
fn set_db_version(conn: &Connection, version: i32) -> Result<()> {
    conn.execute(
        "INSERT INTO schema_version (version) VALUES (?1)",
        [version],
    )?;
    Ok(())
}

/// 初始化数据库表结构
pub fn init_schema(conn: &Connection) -> Result<()> {
    // 创建版本表（如果不存在）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    let current_version = get_db_version(conn)?;

    if current_version < 1 {
        migrate_v1(conn)?;
        set_db_version(conn, 1)?;
    }

    if current_version < 2 {
        migrate_v2(conn)?;
        set_db_version(conn, 2)?;
    }

    if current_version < 3 {
        migrate_v3(conn)?;
        set_db_version(conn, 3)?;
    }

    if current_version < 4 {
        migrate_v4(conn)?;
        set_db_version(conn, 4)?;
    }

    if current_version < 5 {
        migrate_v5(conn)?;
        set_db_version(conn, 5)?;
    }

    if current_version < 6 {
        migrate_v6(conn)?;
        set_db_version(conn, 6)?;
    }

    if current_version < 7 {
        migrate_v7(conn)?;
        set_db_version(conn, 7)?;
    }

    if current_version < 8 {
        migrate_v8(conn)?;
        set_db_version(conn, 8)?;
    }

    if current_version < 9 {
        migrate_v9(conn)?;
        set_db_version(conn, 9)?;
    }

    if current_version < 10 {
        migrate_v10(conn)?;
        set_db_version(conn, 10)?;
    }

    if current_version < 11 {
        migrate_v11(conn)?;
        set_db_version(conn, 11)?;
    }

    if current_version < 12 {
        migrate_v12(conn)?;
        set_db_version(conn, 12)?;
    }

    if current_version < 13 {
        migrate_v13(conn)?;
        set_db_version(conn, 13)?;
    }

    if current_version < 14 {
        migrate_v14(conn)?;
        set_db_version(conn, SCHEMA_VERSION)?;
    }

    Ok(())
}

/// 版本 1: 基础表结构
fn migrate_v1(conn: &Connection) -> Result<()> {
    // 创建 library_folders 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS library_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    // 创建 songs 表 (v1 基础结构)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album TEXT NOT NULL,
            duration INTEGER NOT NULL,
            cover TEXT,
            folder_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 创建 playlists 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    // 创建 playlist_songs 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlist_songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            song_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
            UNIQUE (playlist_id, song_id)
        )",
        [],
    )?;

    // 创建索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_songs_folder_id ON songs(folder_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_id ON playlist_songs(playlist_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_playlist_songs_song_id ON playlist_songs(song_id)",
        [],
    )?;

    Ok(())
}

/// 版本 2: 扩展元数据字段 + 封面优化 + 收藏 + 播放队列
fn migrate_v2(conn: &Connection) -> Result<()> {
    // 检查并添加新字段到 songs 表
    let columns_to_add = [
        ("album_artist", "TEXT"),
        ("year", "INTEGER"),
        ("genre", "TEXT"),
        ("track_number", "INTEGER"),
        ("track_total", "INTEGER"),
        ("disc_number", "INTEGER"),
        ("disc_total", "INTEGER"),
        ("play_count", "INTEGER DEFAULT 0"),
        ("last_played_at", "TEXT"),
        ("is_favorite", "INTEGER DEFAULT 0"),
        ("rating", "INTEGER"),
        ("cover_path", "TEXT"),
    ];

    for (column_name, column_type) in columns_to_add {
        let sql = format!(
            "ALTER TABLE songs ADD COLUMN {} {}",
            column_name, column_type
        );
        // 忽略"列已存在"错误
        let _ = conn.execute(&sql, []);
    }

    // 创建播放队列表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS play_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            song_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 创建搜索优化索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_songs_is_favorite ON songs(is_favorite)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_play_queue_position ON play_queue(position)",
        [],
    )?;

    Ok(())
}

/// 版本 3: 添加 status 字段及视图
fn migrate_v3(conn: &Connection) -> Result<()> {
    // 1. 添加 status 字段
    // 检查字段是否存在（防止重复运行出错）
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(songs)")?
        .query_map([], |row| row.get(1))?
        .collect::<Result<Vec<String>>>()?;

    if !columns.contains(&"status".to_string()) {
        conn.execute(
            "ALTER TABLE songs ADD COLUMN status TEXT DEFAULT 'active'",
            [],
        )?;
    }

    // 2. 迁移旧数据 (is_hidden -> status)
    if columns.contains(&"is_hidden".to_string()) {
        conn.execute(
            "UPDATE songs SET status = 'archived' WHERE is_hidden = 1",
            [],
        )?;
    }

    // 3. 创建视图
    conn.execute("DROP VIEW IF EXISTS library_songs", [])?;
    conn.execute(
        "CREATE VIEW library_songs AS 
         SELECT id, path, title, artist, album, duration, cover, cover_path, folder_id, 
                album_artist, year, genre, track_number, track_total, disc_number, disc_total,
                play_count, last_played_at, is_favorite, rating, created_at, updated_at
         FROM songs 
         WHERE status = 'active'
         ORDER BY title",
        [],
    )?;

    conn.execute("DROP VIEW IF EXISTS archived_songs", [])?;
    conn.execute(
        "CREATE VIEW archived_songs AS 
         SELECT id, path, title, artist, album, duration, cover, cover_path, folder_id, 
                album_artist, year, genre, track_number, track_total, disc_number, disc_total,
                play_count, last_played_at, is_favorite, rating, created_at, updated_at
         FROM songs 
         WHERE status = 'archived'
         ORDER BY title",
        [],
    )?;

    Ok(())
}

/// 版本 4: 播放列表扩展字段
fn migrate_v4(conn: &Connection) -> Result<()> {
    // 检查字段是否存在（防止重复运行出错）
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(playlists)")?
        .query_map([], |row| row.get(1))?
        .collect::<Result<Vec<String>>>()?;

    if !columns.contains(&"cover_path".to_string()) {
        conn.execute("ALTER TABLE playlists ADD COLUMN cover_path TEXT", [])?;
    }

    if !columns.contains(&"description".to_string()) {
        conn.execute("ALTER TABLE playlists ADD COLUMN description TEXT", [])?;
    }

    Ok(())
}

/// 版本 5: 播放列表增加 last_played_at 字段
fn migrate_v5(conn: &Connection) -> Result<()> {
    // 检查字段是否存在（防止重复运行出错）
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(playlists)")?
        .query_map([], |row| row.get(1))?
        .collect::<Result<Vec<String>>>()?;

    if !columns.contains(&"last_played_at".to_string()) {
        conn.execute("ALTER TABLE playlists ADD COLUMN last_played_at TEXT", [])?;
    }

    Ok(())
}

/// 版本 6: 移除 playlist_songs 的唯一约束 (playlist_id, song_id)
/// 允许播放列表中存在重复歌曲
fn migrate_v6(conn: &Connection) -> Result<()> {
    // 1. 创建新表 (无 UNIQUE 约束)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlist_songs_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            song_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 2. 迁移旧数据
    conn.execute(
        "INSERT INTO playlist_songs_new (id, playlist_id, song_id, position)
         SELECT id, playlist_id, song_id, position FROM playlist_songs",
        [],
    )?;

    // 3. 删除旧表
    conn.execute("DROP TABLE playlist_songs", [])?;

    // 4. 重命名新表
    conn.execute(
        "ALTER TABLE playlist_songs_new RENAME TO playlist_songs",
        [],
    )?;

    // 5. 重建索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_id ON playlist_songs(playlist_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_playlist_songs_song_id ON playlist_songs(song_id)",
        [],
    )?;

    Ok(())
}

/// 版本 7: 创建 videos 表
fn migrate_v7(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            duration INTEGER NOT NULL DEFAULT 0,
            size INTEGER,
            width INTEGER,
            height INTEGER,
            thumbnail_path TEXT,
            
            -- 用户数据
            is_favorite INTEGER DEFAULT 0,
            play_count INTEGER DEFAULT 0,
            last_played_at TEXT,
            
            -- 关联与状态
            folder_id INTEGER,
            status TEXT DEFAULT 'active', -- active, archived (missing)
            
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            
            FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 创建索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_videos_path ON videos(path)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_videos_folder_id ON videos(folder_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status)",
        [],
    )?;

    Ok(())
}

/// 版本 8: 给 library_folders 添加 folder_type 字段
fn migrate_v8(conn: &Connection) -> Result<()> {
    // 添加 folder_type 字段，默认为 'music'
    conn.execute(
        "ALTER TABLE library_folders ADD COLUMN folder_type TEXT NOT NULL DEFAULT 'music'",
        [],
    )?;

    // 将包含视频的文件夹类型更新为 'video'
    // 如果文件夹关联了 videos 表中的记录，则认为是视频文件夹
    conn.execute(
        "UPDATE library_folders 
         SET folder_type = 'video' 
         WHERE id IN (
             SELECT DISTINCT folder_id 
             FROM videos 
             WHERE folder_id IS NOT NULL
         )",
        [],
    )?;

    // 创建索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_folders_type ON library_folders(folder_type)",
        [],
    )?;

    Ok(())
}

/// 版本 9: 创建 transcoded_cache 表用于 LRU 缓存管理
fn migrate_v9(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS transcoded_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path TEXT NOT NULL,
            source_hash TEXT NOT NULL UNIQUE,
            cache_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            codec_info TEXT,
            last_accessed_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            is_in_use INTEGER DEFAULT 0
        )",
        [],
    )?;

    // 创建索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_transcoded_cache_last_accessed 
         ON transcoded_cache(last_accessed_at)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_transcoded_cache_in_use 
         ON transcoded_cache(is_in_use)",
        [],
    )?;

    Ok(())
}

/// 版本 10: 创建 app_settings 表用于持久化配置
fn migrate_v10(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )",
        [],
    )?;
    Ok(())
}

/// 版本 11: 清理旧的 base64 封面字段
fn migrate_v11(conn: &Connection) -> Result<()> {
    conn.execute("UPDATE songs SET cover = NULL WHERE cover IS NOT NULL", [])?;
    Ok(())
}

/// 版本 12: 用户自定义歌词
fn migrate_v12(conn: &Connection) -> Result<()> {
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(songs)")?
        .query_map([], |row| row.get(1))?
        .collect::<Result<Vec<String>>>()?;

    if !columns.contains(&"lyrics_text".to_string()) {
        conn.execute("ALTER TABLE songs ADD COLUMN lyrics_text TEXT", [])?;
    }

    if !columns.contains(&"lyrics_source_path".to_string()) {
        conn.execute("ALTER TABLE songs ADD COLUMN lyrics_source_path TEXT", [])?;
    }

    Ok(())
}

/// Version 13: per-song lyrics timeline offset in milliseconds.
fn migrate_v13(conn: &Connection) -> Result<()> {
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(songs)")?
        .query_map([], |row| row.get(1))?
        .collect::<Result<Vec<String>>>()?;

    if !columns.contains(&"lyrics_offset_ms".to_string()) {
        conn.execute(
            "ALTER TABLE songs ADD COLUMN lyrics_offset_ms INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    Ok(())
}

/// Version 14: distinguish files missing from disk from songs explicitly excluded by the user.
fn migrate_v14(conn: &Connection) -> Result<()> {
    conn.execute(
        "UPDATE songs SET status = 'missing' WHERE status = 'archived'",
        [],
    )?;

    conn.execute("DROP VIEW IF EXISTS archived_songs", [])?;
    conn.execute(
        "CREATE VIEW archived_songs AS
         SELECT id, path, title, artist, album, duration, cover, cover_path, folder_id,
                album_artist, year, genre, track_number, track_total, disc_number, disc_total,
                play_count, last_played_at, is_favorite, rating, created_at, updated_at
         FROM songs
         WHERE status != 'active'
         ORDER BY title",
        [],
    )?;

    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_v13_defaults_existing_songs_to_zero() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute("CREATE TABLE songs (id INTEGER PRIMARY KEY)", [])
            .expect("create legacy songs table");
        conn.execute("INSERT INTO songs (id) VALUES (1)", [])
            .expect("insert legacy song");

        migrate_v13(&conn).expect("run v13 migration");
        migrate_v13(&conn).expect("v13 migration remains idempotent");

        let offset: i32 = conn
            .query_row(
                "SELECT lyrics_offset_ms FROM songs WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("read migrated offset");
        assert_eq!(offset, 0);
    }

    #[test]
    fn migration_v14_converts_legacy_archived_songs_to_missing() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(
            "CREATE TABLE songs (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                duration INTEGER NOT NULL,
                cover TEXT,
                cover_path TEXT,
                folder_id INTEGER,
                album_artist TEXT,
                year INTEGER,
                genre TEXT,
                track_number INTEGER,
                track_total INTEGER,
                disc_number INTEGER,
                disc_total INTEGER,
                play_count INTEGER,
                last_played_at TEXT,
                is_favorite INTEGER,
                rating INTEGER,
                created_at TEXT,
                updated_at TEXT,
                status TEXT NOT NULL
            );
            INSERT INTO songs (
                id, path, title, artist, album, duration, status
            ) VALUES
                (1, 'missing.mp3', 'Missing', 'Artist', 'Album', 1, 'archived'),
                (2, 'active.mp3', 'Active', 'Artist', 'Album', 1, 'active');",
        )
        .expect("create legacy songs");

        migrate_v14(&conn).expect("run v14 migration");

        let statuses: Vec<String> = conn
            .prepare("SELECT status FROM songs ORDER BY id")
            .expect("prepare status query")
            .query_map([], |row| row.get(0))
            .expect("query statuses")
            .collect::<Result<Vec<_>>>()
            .expect("collect statuses");
        assert_eq!(statuses, vec!["missing", "active"]);
    }
}
