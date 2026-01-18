use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

// ============================================================================
// 数据模型
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryFolder {
    pub id: i64,
    pub path: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: i64,
    pub cover: Option<String>,
    pub folder_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistSong {
    pub id: i64,
    pub playlist_id: i64,
    pub song_id: i64,
    pub position: i64,
}

// ============================================================================
// FolderRepo - 文件夹仓库
// ============================================================================

pub struct FolderRepo;

impl FolderRepo {
    /// 获取所有文件夹
    pub fn get_all(conn: &Connection) -> Result<Vec<LibraryFolder>> {
        let mut stmt = conn.prepare("SELECT id, path, created_at FROM library_folders ORDER BY created_at")?;
        let folders = stmt
            .query_map([], |row| {
                Ok(LibraryFolder {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(folders)
    }

    /// 添加文件夹
    pub fn add(conn: &Connection, path: &str) -> Result<LibraryFolder> {
        conn.execute(
            "INSERT OR IGNORE INTO library_folders (path) VALUES (?1)",
            params![path],
        )?;

        let mut stmt = conn.prepare("SELECT id, path, created_at FROM library_folders WHERE path = ?1")?;
        stmt.query_row(params![path], |row| {
            Ok(LibraryFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
    }

    /// 删除文件夹（同时删除关联的歌曲）
    pub fn remove(conn: &Connection, path: &str) -> Result<()> {
        // 先删除关联的歌曲
        conn.execute(
            "DELETE FROM songs WHERE folder_id = (SELECT id FROM library_folders WHERE path = ?1)",
            params![path],
        )?;
        // 再删除文件夹
        conn.execute("DELETE FROM library_folders WHERE path = ?1", params![path])?;
        Ok(())
    }

    /// 根据路径获取文件夹
    pub fn get_by_path(conn: &Connection, path: &str) -> Result<Option<LibraryFolder>> {
        let mut stmt = conn.prepare("SELECT id, path, created_at FROM library_folders WHERE path = ?1")?;
        let result = stmt.query_row(params![path], |row| {
            Ok(LibraryFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                created_at: row.get(2)?,
            })
        });
        match result {
            Ok(folder) => Ok(Some(folder)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

// ============================================================================
// SongRepo - 歌曲仓库
// ============================================================================

pub struct SongRepo;

impl SongRepo {
    /// 获取所有歌曲
    pub fn get_all(conn: &Connection) -> Result<Vec<Song>> {
        let mut stmt = conn.prepare(
            "SELECT id, path, title, artist, album, duration, cover, folder_id, created_at, updated_at 
             FROM songs ORDER BY title"
        )?;
        let songs = stmt
            .query_map([], |row| {
                Ok(Song {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    title: row.get(2)?,
                    artist: row.get(3)?,
                    album: row.get(4)?,
                    duration: row.get(5)?,
                    cover: row.get(6)?,
                    folder_id: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 根据文件夹 ID 获取歌曲
    pub fn get_by_folder(conn: &Connection, folder_id: i64) -> Result<Vec<Song>> {
        let mut stmt = conn.prepare(
            "SELECT id, path, title, artist, album, duration, cover, folder_id, created_at, updated_at 
             FROM songs WHERE folder_id = ?1 ORDER BY title"
        )?;
        let songs = stmt
            .query_map(params![folder_id], |row| {
                Ok(Song {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    title: row.get(2)?,
                    artist: row.get(3)?,
                    album: row.get(4)?,
                    duration: row.get(5)?,
                    cover: row.get(6)?,
                    folder_id: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 根据路径获取歌曲
    pub fn get_by_path(conn: &Connection, path: &str) -> Result<Option<Song>> {
        let mut stmt = conn.prepare(
            "SELECT id, path, title, artist, album, duration, cover, folder_id, created_at, updated_at 
             FROM songs WHERE path = ?1"
        )?;
        let result = stmt.query_row(params![path], |row| {
            Ok(Song {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                duration: row.get(5)?,
                cover: row.get(6)?,
                folder_id: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        });
        match result {
            Ok(song) => Ok(Some(song)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// 插入或更新歌曲
    pub fn upsert(
        conn: &Connection,
        path: &str,
        title: &str,
        artist: &str,
        album: &str,
        duration: i64,
        cover: Option<&str>,
        folder_id: Option<i64>,
    ) -> Result<Song> {
        conn.execute(
            "INSERT INTO songs (path, title, artist, album, duration, cover, folder_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(path) DO UPDATE SET
                title = excluded.title,
                artist = excluded.artist,
                album = excluded.album,
                duration = excluded.duration,
                cover = excluded.cover,
                folder_id = excluded.folder_id,
                updated_at = datetime('now')",
            params![path, title, artist, album, duration, cover, folder_id],
        )?;

        // 返回刚插入/更新的歌曲
        Self::get_by_path(conn, path)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    /// 删除歌曲
    pub fn delete(conn: &Connection, id: i64) -> Result<()> {
        conn.execute("DELETE FROM songs WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// 删除文件夹下所有歌曲
    pub fn delete_by_folder(conn: &Connection, folder_id: i64) -> Result<()> {
        conn.execute("DELETE FROM songs WHERE folder_id = ?1", params![folder_id])?;
        Ok(())
    }

    /// 获取不在给定路径列表中的歌曲（用于清理已删除的文件）
    pub fn get_songs_not_in_paths(conn: &Connection, folder_id: i64, paths: &[String]) -> Result<Vec<Song>> {
        if paths.is_empty() {
            return Self::get_by_folder(conn, folder_id);
        }
        
        let placeholders: String = paths.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id, path, title, artist, album, duration, cover, folder_id, created_at, updated_at 
             FROM songs WHERE folder_id = ?1 AND path NOT IN ({})",
            placeholders
        );
        
        let mut stmt = conn.prepare(&sql)?;
        
        // 构建参数
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        params_vec.push(Box::new(folder_id));
        for path in paths {
            params_vec.push(Box::new(path.clone()));
        }
        let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
        
        let songs = stmt
            .query_map(params_refs.as_slice(), |row| {
                Ok(Song {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    title: row.get(2)?,
                    artist: row.get(3)?,
                    album: row.get(4)?,
                    duration: row.get(5)?,
                    cover: row.get(6)?,
                    folder_id: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }
}

// ============================================================================
// PlaylistRepo - 播放列表仓库
// ============================================================================

pub struct PlaylistRepo;

impl PlaylistRepo {
    /// 获取所有播放列表
    pub fn get_all(conn: &Connection) -> Result<Vec<Playlist>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at, updated_at FROM playlists ORDER BY created_at DESC"
        )?;
        let playlists = stmt
            .query_map([], |row| {
                Ok(Playlist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(playlists)
    }

    /// 创建播放列表
    pub fn create(conn: &Connection, name: &str) -> Result<Playlist> {
        conn.execute(
            "INSERT INTO playlists (name) VALUES (?1)",
            params![name],
        )?;
        let id = conn.last_insert_rowid();
        
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at, updated_at FROM playlists WHERE id = ?1"
        )?;
        stmt.query_row(params![id], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
    }

    /// 根据 ID 获取播放列表
    pub fn get_by_id(conn: &Connection, id: i64) -> Result<Option<Playlist>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at, updated_at FROM playlists WHERE id = ?1"
        )?;
        let result = stmt.query_row(params![id], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        });
        match result {
            Ok(playlist) => Ok(Some(playlist)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// 更新播放列表名称
    pub fn update_name(conn: &Connection, id: i64, name: &str) -> Result<()> {
        conn.execute(
            "UPDATE playlists SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![name, id],
        )?;
        Ok(())
    }

    /// 删除播放列表
    pub fn delete(conn: &Connection, id: i64) -> Result<()> {
        // 先删除关联的歌曲
        conn.execute("DELETE FROM playlist_songs WHERE playlist_id = ?1", params![id])?;
        // 再删除播放列表
        conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// 添加歌曲到播放列表
    pub fn add_song(conn: &Connection, playlist_id: i64, song_id: i64) -> Result<()> {
        // 获取当前最大位置
        let max_position: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), 0) FROM playlist_songs WHERE playlist_id = ?1",
                params![playlist_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        conn.execute(
            "INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?1, ?2, ?3)",
            params![playlist_id, song_id, max_position + 1],
        )?;

        // 更新播放列表的 updated_at
        conn.execute(
            "UPDATE playlists SET updated_at = datetime('now') WHERE id = ?1",
            params![playlist_id],
        )?;

        Ok(())
    }

    /// 从播放列表移除歌曲
    pub fn remove_song(conn: &Connection, playlist_id: i64, song_id: i64) -> Result<()> {
        conn.execute(
            "DELETE FROM playlist_songs WHERE playlist_id = ?1 AND song_id = ?2",
            params![playlist_id, song_id],
        )?;

        // 更新播放列表的 updated_at
        conn.execute(
            "UPDATE playlists SET updated_at = datetime('now') WHERE id = ?1",
            params![playlist_id],
        )?;

        Ok(())
    }

    /// 获取播放列表中的所有歌曲
    pub fn get_songs(conn: &Connection, playlist_id: i64) -> Result<Vec<Song>> {
        let mut stmt = conn.prepare(
            "SELECT s.id, s.path, s.title, s.artist, s.album, s.duration, s.cover, s.folder_id, s.created_at, s.updated_at
             FROM songs s
             INNER JOIN playlist_songs ps ON s.id = ps.song_id
             WHERE ps.playlist_id = ?1
             ORDER BY ps.position"
        )?;
        let songs = stmt
            .query_map(params![playlist_id], |row| {
                Ok(Song {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    title: row.get(2)?,
                    artist: row.get(3)?,
                    album: row.get(4)?,
                    duration: row.get(5)?,
                    cover: row.get(6)?,
                    folder_id: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 更新歌曲在播放列表中的位置
    pub fn update_song_position(conn: &Connection, playlist_id: i64, song_id: i64, new_position: i64) -> Result<()> {
        conn.execute(
            "UPDATE playlist_songs SET position = ?1 WHERE playlist_id = ?2 AND song_id = ?3",
            params![new_position, playlist_id, song_id],
        )?;
        Ok(())
    }
}
