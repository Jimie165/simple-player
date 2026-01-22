use rusqlite::{Connection, Result};

/// 当前数据库版本
const SCHEMA_VERSION: i32 = 5;

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
        let sql = format!("ALTER TABLE songs ADD COLUMN {} {}", column_name, column_type);
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
        conn.execute("ALTER TABLE songs ADD COLUMN status TEXT DEFAULT 'active'", [])?;
    }

    // 2. 迁移旧数据 (is_hidden -> status)
    if columns.contains(&"is_hidden".to_string()) {
        conn.execute("UPDATE songs SET status = 'archived' WHERE is_hidden = 1", [])?;
    }

    // 3. 创建视图
    conn.execute(
        "DROP VIEW IF EXISTS library_songs",
        [],
    )?;
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

    conn.execute(
        "DROP VIEW IF EXISTS archived_songs",
        [],
    )?;
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

