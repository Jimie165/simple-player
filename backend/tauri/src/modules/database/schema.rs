use rusqlite::{Connection, Result};

/// 初始化数据库表结构
pub fn init_schema(conn: &Connection) -> Result<()> {
    // 创建 library_folders 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS library_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    // 创建 songs 表
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

    // 创建索引以提高查询性能
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
