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
    pub cover: Option<String>,      // 旧字段，保留兼容
    pub cover_path: Option<String>, // 新字段：封面文件路径
    pub folder_id: Option<i64>,
    // 扩展元数据
    pub album_artist: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub track_number: Option<i32>,
    pub track_total: Option<i32>,
    pub disc_number: Option<i32>,
    pub disc_total: Option<i32>,
    // 用户数据
    pub play_count: i32,
    pub last_played_at: Option<String>,
    pub is_favorite: bool,
    pub rating: Option<i32>,
    pub status: String, // 'active' | 'archived'
    // 时间戳
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub cover_path: Option<String>,
    pub description: Option<String>,
    pub song_count: i32,
    pub last_played_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistSong {
    pub id: i64,
    pub playlist_id: i64,
    pub song_id: i64,
    pub position: i64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayQueueItem {
    pub id: i64,
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
        let mut stmt =
            conn.prepare("SELECT id, path, created_at FROM library_folders ORDER BY created_at")?;
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

        let mut stmt =
            conn.prepare("SELECT id, path, created_at FROM library_folders WHERE path = ?1")?;
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
        conn.execute(
            "DELETE FROM songs WHERE folder_id = (SELECT id FROM library_folders WHERE path = ?1)",
            params![path],
        )?;
        conn.execute("DELETE FROM library_folders WHERE path = ?1", params![path])?;
        Ok(())
    }

    /// 根据路径获取文件夹
    #[allow(dead_code)]
    pub fn get_by_path(conn: &Connection, path: &str) -> Result<Option<LibraryFolder>> {
        let mut stmt =
            conn.prepare("SELECT id, path, created_at FROM library_folders WHERE path = ?1")?;
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
    /// 从数据库行映射到 Song 结构体
    fn map_row(row: &rusqlite::Row) -> rusqlite::Result<Song> {
        Ok(Song {
            id: row.get(0)?,
            path: row.get(1)?,
            title: row.get(2)?,
            artist: row.get(3)?,
            album: row.get(4)?,
            duration: row.get(5)?,
            cover: row.get(6)?,
            cover_path: row.get(7)?,
            folder_id: row.get(8)?,
            album_artist: row.get(9)?,
            year: row.get(10)?,
            genre: row.get(11)?,
            track_number: row.get(12)?,
            track_total: row.get(13)?,
            disc_number: row.get(14)?,
            disc_total: row.get(15)?,
            play_count: row.get::<_, Option<i32>>(16)?.unwrap_or(0),
            last_played_at: row.get(17)?,
            is_favorite: row.get::<_, Option<i32>>(18)?.unwrap_or(0) != 0,
            rating: row.get(19)?,
            status: row
                .get::<_, Option<String>>(20)?
                .unwrap_or("active".to_string()),
            created_at: row.get(21)?,
            updated_at: row.get(22)?,
        })
    }

    const SELECT_COLUMNS: &'static str =
        "id, path, title, artist, album, duration, cover, cover_path, folder_id, 
         album_artist, year, genre, track_number, track_total, disc_number, disc_total,
         play_count, last_played_at, is_favorite, rating, status, created_at, updated_at";

    /// 获取所有活跃歌曲
    pub fn get_all(conn: &Connection) -> Result<Vec<Song>> {
        let sql = format!(
            "SELECT {} FROM songs WHERE status = 'active' ORDER BY created_at DESC",
            Self::SELECT_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let songs = stmt
            .query_map([], Self::map_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 获取所有已归档歌曲
    #[allow(dead_code)]
    pub fn get_archived(conn: &Connection) -> Result<Vec<Song>> {
        let sql = format!(
            "SELECT {} FROM songs WHERE status = 'archived' ORDER BY title",
            Self::SELECT_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let songs = stmt
            .query_map([], Self::map_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 根据文件夹 ID 获取歌曲
    pub fn get_by_folder(conn: &Connection, folder_id: i64) -> Result<Vec<Song>> {
        let sql = format!(
            "SELECT {} FROM songs WHERE folder_id = ?1 AND status = 'active' ORDER BY title",
            Self::SELECT_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let songs = stmt
            .query_map(params![folder_id], Self::map_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 根据路径获取歌曲
    pub fn get_by_path(conn: &Connection, path: &str) -> Result<Option<Song>> {
        let sql = format!(
            "SELECT {} FROM songs WHERE path = ?1 AND status = 'active'",
            Self::SELECT_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let result = stmt.query_row(params![path], Self::map_row);
        match result {
            Ok(song) => Ok(Some(song)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// 根据路径获取歌曲（任意状态）
    pub fn get_by_path_any_status(conn: &Connection, path: &str) -> Result<Option<Song>> {
        let sql = format!("SELECT {} FROM songs WHERE path = ?1", Self::SELECT_COLUMNS);
        let mut stmt = conn.prepare(&sql)?;
        let result = stmt.query_row(params![path], Self::map_row);
        match result {
            Ok(song) => Ok(Some(song)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// 根据 ID 获取歌曲
    #[allow(dead_code)]
    pub fn get_by_id(conn: &Connection, id: i64) -> Result<Option<Song>> {
        let sql = format!("SELECT {} FROM songs WHERE id = ?1", Self::SELECT_COLUMNS);
        let mut stmt = conn.prepare(&sql)?;
        let result = stmt.query_row(params![id], Self::map_row);
        match result {
            Ok(song) => Ok(Some(song)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// 插入或更新歌曲（包含扩展元数据）
    #[allow(clippy::too_many_arguments)]
    pub fn upsert(
        conn: &Connection,
        path: &str,
        title: &str,
        artist: &str,
        album: &str,
        duration: i64,
        cover: Option<&str>,
        cover_path: Option<&str>,
        folder_id: Option<i64>,
        album_artist: Option<&str>,
        year: Option<i32>,
        genre: Option<&str>,
        track_number: Option<i32>,
        track_total: Option<i32>,
        disc_number: Option<i32>,
        disc_total: Option<i32>,
    ) -> Result<()> {
        // 使用 ON CONFLICT DO UPDATE，但保留 status 不变（除非显式修改，这里不修改 status）
        let sql = "
            INSERT INTO songs (
                path, title, artist, album, duration, cover, cover_path, folder_id,
                album_artist, year, genre, track_number, track_total, disc_number, disc_total,
                status, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                'active', datetime('now')
            )
            ON CONFLICT(path) DO UPDATE SET
                title = excluded.title,
                artist = excluded.artist,
                album = excluded.album,
                duration = excluded.duration,
                cover = excluded.cover,
                cover_path = excluded.cover_path,
                folder_id = excluded.folder_id,
                album_artist = excluded.album_artist,
                year = excluded.year,
                genre = excluded.genre,
                track_number = excluded.track_number,
                track_total = excluded.track_total,
                disc_number = excluded.disc_number,
                disc_total = excluded.disc_total,
                updated_at = datetime('now')
        ";
        // 注意：这里不更新 status，如果已存在，保持原状态。status更新逻辑在 library.rs 中处理。

        conn.execute(
            sql,
            params![
                path,
                title,
                artist,
                album,
                duration,
                cover,
                cover_path,
                folder_id,
                album_artist,
                year,
                genre,
                track_number,
                track_total,
                disc_number,
                disc_total
            ],
        )?;
        Ok(())
    }

    /// 软删除歌曲（标记为归档）
    pub fn delete(conn: &Connection, id: i64) -> Result<()> {
        conn.execute(
            "UPDATE songs SET status = 'archived', updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// 批量软删除歌曲
    pub fn batch_delete(conn: &Connection, ids: &[i64]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "UPDATE songs SET status = 'archived', updated_at = datetime('now') WHERE id IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql)?;
        let params_refs: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        stmt.execute(params_refs.as_slice())?;
        Ok(())
    }

    /// 恢复歌曲（标记为活跃）
    pub fn restore(conn: &Connection, id: i64) -> Result<()> {
        conn.execute(
            "UPDATE songs SET status = 'active', updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// 更新歌曲元数据
    #[allow(clippy::too_many_arguments)]
    pub fn update_metadata(
        conn: &Connection,
        id: i64,
        title: &str,
        artist: &str,
        album: &str,
        duration: i64,
        cover: Option<&str>,
        cover_path: Option<&str>,
        album_artist: Option<&str>,
        year: Option<i32>,
        genre: Option<&str>,
        track_number: Option<i32>,
        track_total: Option<i32>,
        disc_number: Option<i32>,
        disc_total: Option<i32>,
    ) -> Result<()> {
        conn.execute(
            "UPDATE songs SET
                title = ?1, artist = ?2, album = ?3, duration = ?4,
                cover = ?5, cover_path = ?6, album_artist = ?7,
                year = ?8, genre = ?9, track_number = ?10, track_total = ?11,
                disc_number = ?12, disc_total = ?13,
                updated_at = datetime('now')
            WHERE id = ?14",
            params![
                title,
                artist,
                album,
                duration,
                cover,
                cover_path,
                album_artist,
                year,
                genre,
                track_number,
                track_total,
                disc_number,
                disc_total,
                id
            ],
        )?;
        Ok(())
    }

    /// 硬删除歌曲（用于清理文件已不存在的记录）
    #[allow(dead_code)]
    pub fn hard_delete(conn: &Connection, id: i64) -> Result<()> {
        conn.execute("DELETE FROM songs WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// 删除文件夹下所有歌曲
    #[allow(dead_code)]
    pub fn delete_by_folder(conn: &Connection, folder_id: i64) -> Result<()> {
        conn.execute("DELETE FROM songs WHERE folder_id = ?1", params![folder_id])?;
        Ok(())
    }

    /// 获取不在给定路径列表中的歌曲
    pub fn get_songs_not_in_paths(
        conn: &Connection,
        folder_id: i64,
        paths: &[String],
    ) -> Result<Vec<Song>> {
        if paths.is_empty() {
            return Self::get_by_folder(conn, folder_id);
        }

        let placeholders: String = paths.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT {} FROM songs WHERE folder_id = ?1 AND path NOT IN ({})",
            Self::SELECT_COLUMNS,
            placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        params_vec.push(Box::new(folder_id));
        for path in paths {
            params_vec.push(Box::new(path.clone()));
        }
        let params_refs: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();

        let songs = stmt
            .query_map(params_refs.as_slice(), Self::map_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 搜索歌曲
    pub fn search(conn: &Connection, query: &str) -> Result<Vec<Song>> {
        let pattern = format!("%{}%", query);
        let sql = format!(
            "SELECT {} FROM songs 
             WHERE title LIKE ?1 OR artist LIKE ?1 OR album LIKE ?1 OR album_artist LIKE ?1
             ORDER BY 
                CASE WHEN title LIKE ?1 THEN 0 ELSE 1 END,
                CASE WHEN artist LIKE ?1 THEN 0 ELSE 1 END,
                title
             LIMIT 100",
            Self::SELECT_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let songs = stmt
            .query_map(params![pattern], Self::map_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 切换收藏状态
    pub fn toggle_favorite(conn: &Connection, id: i64) -> Result<bool> {
        conn.execute(
            "UPDATE songs SET is_favorite = NOT is_favorite, updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )?;

        let is_favorite: i32 = conn.query_row(
            "SELECT is_favorite FROM songs WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;

        Ok(is_favorite != 0)
    }

    /// 批量设置收藏状态
    pub fn batch_set_favorite(conn: &Connection, ids: &[i64], is_favorite: bool) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "UPDATE songs SET is_favorite = ?1, updated_at = datetime('now') WHERE id IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql)?;

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        params_vec.push(Box::new(if is_favorite { 1i32 } else { 0i32 }));
        for id in ids {
            params_vec.push(Box::new(*id));
        }
        let params_refs: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();
        stmt.execute(params_refs.as_slice())?;
        Ok(())
    }

    /// 获取所有收藏的歌曲
    /// sort_order: "asc" 表示升序（旧→新），"desc" 表示降序（新→旧）
    pub fn get_favorites(conn: &Connection, sort_order: &str) -> Result<Vec<Song>> {
        let order_clause = if sort_order == "desc" {
            "updated_at DESC, id DESC"
        } else {
            "updated_at ASC, id ASC"
        };
        let sql = format!(
            "SELECT {} FROM songs WHERE is_favorite = 1 ORDER BY {}",
            Self::SELECT_COLUMNS,
            order_clause
        );
        let mut stmt = conn.prepare(&sql)?;
        let songs = stmt
            .query_map([], Self::map_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 更新播放次数
    pub fn increment_play_count(conn: &Connection, id: i64) -> Result<()> {
        conn.execute(
            "UPDATE songs SET play_count = play_count + 1, last_played_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )?;
        Ok(())
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
            "SELECT p.id, p.name, p.cover_path, p.description, p.last_played_at, p.created_at, p.updated_at,
                    (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) as song_count
             FROM playlists p
             ORDER BY p.created_at DESC"
        )?;
        let playlists = stmt
            .query_map([], |row| {
                Ok(Playlist {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    cover_path: row.get(2)?,
                    description: row.get(3)?,
                    last_played_at: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    song_count: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(playlists)
    }

    /// 创建播放列表
    pub fn create(conn: &Connection, name: &str) -> Result<Playlist> {
        conn.execute("INSERT INTO playlists (name) VALUES (?1)", params![name])?;
        let id = conn.last_insert_rowid();

        let mut stmt = conn.prepare(
            "SELECT id, name, cover_path, description, last_played_at, created_at, updated_at FROM playlists WHERE id = ?1"
        )?;
        stmt.query_row(params![id], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                cover_path: row.get(2)?,
                description: row.get(3)?,
                last_played_at: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                song_count: 0,
            })
        })
    }

    /// 根据 ID 获取播放列表
    #[allow(dead_code)]
    pub fn get_by_id(conn: &Connection, id: i64) -> Result<Option<Playlist>> {
        let mut stmt = conn.prepare(
            "SELECT p.id, p.name, p.cover_path, p.description, p.last_played_at, p.created_at, p.updated_at,
                    (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) as song_count
             FROM playlists p
             WHERE p.id = ?1"
        )?;
        let result = stmt.query_row(params![id], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                cover_path: row.get(2)?,
                description: row.get(3)?,
                last_played_at: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                song_count: row.get(7)?,
            })
        });
        match result {
            Ok(playlist) => Ok(Some(playlist)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// 更新播放列表基本信息
    pub fn update_info(
        conn: &Connection,
        id: i64,
        name: &str,
        description: Option<&str>,
    ) -> Result<()> {
        conn.execute(
            "UPDATE playlists SET name = ?1, description = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![name, description, id],
        )?;
        Ok(())
    }

    /// 更新播放列表封面
    pub fn update_cover(conn: &Connection, id: i64, cover_path: Option<&str>) -> Result<()> {
        conn.execute(
            "UPDATE playlists SET cover_path = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![cover_path, id],
        )?;
        Ok(())
    }

    /// 更新播放列表最后播放时间
    pub fn update_last_played(conn: &Connection, id: i64) -> Result<()> {
        conn.execute(
            "UPDATE playlists SET last_played_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// 删除播放列表
    pub fn delete(conn: &Connection, id: i64) -> Result<()> {
        conn.execute(
            "DELETE FROM playlist_songs WHERE playlist_id = ?1",
            params![id],
        )?;
        conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// 添加歌曲到播放列表
    pub fn add_song(conn: &Connection, playlist_id: i64, song_id: i64) -> Result<()> {
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

        conn.execute(
            "UPDATE playlists SET updated_at = datetime('now') WHERE id = ?1",
            params![playlist_id],
        )?;

        Ok(())
    }

    /// 批量添加歌曲到播放列表
    pub fn batch_add_songs(conn: &Connection, playlist_id: i64, song_ids: &[i64]) -> Result<()> {
        if song_ids.is_empty() {
            return Ok(());
        }

        let max_position: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), 0) FROM playlist_songs WHERE playlist_id = ?1",
                params![playlist_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        for (i, song_id) in song_ids.iter().enumerate() {
            conn.execute(
                "INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?1, ?2, ?3)",
                params![playlist_id, song_id, max_position + 1 + i as i64],
            )?;
        }

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

        conn.execute(
            "UPDATE playlists SET updated_at = datetime('now') WHERE id = ?1",
            params![playlist_id],
        )?;

        Ok(())
    }

    /// 获取播放列表中的所有歌曲
    pub fn get_songs(conn: &Connection, playlist_id: i64) -> Result<Vec<Song>> {
        let sql = format!(
            "SELECT s.id, s.path, s.title, s.artist, s.album, s.duration, s.cover, s.cover_path, s.folder_id,
                    s.album_artist, s.year, s.genre, s.track_number, s.track_total, s.disc_number, s.disc_total,
                    s.play_count, s.last_played_at, s.is_favorite, s.rating, s.status, s.created_at, s.updated_at
             FROM songs s
             INNER JOIN playlist_songs ps ON s.id = ps.song_id
             WHERE ps.playlist_id = ?1
             ORDER BY ps.position"
        );
        let mut stmt = conn.prepare(&sql)?;
        let songs = stmt
            .query_map(params![playlist_id], SongRepo::map_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 批量移除歌曲
    pub fn batch_remove_songs(conn: &Connection, playlist_id: i64, song_ids: &[i64]) -> Result<()> {
        if song_ids.is_empty() {
            return Ok(());
        }
        let placeholders: String = song_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "DELETE FROM playlist_songs WHERE playlist_id = ?1 AND song_id IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql)?;

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        params_vec.push(Box::new(playlist_id));
        for id in song_ids {
            params_vec.push(Box::new(*id));
        }
        let params_refs: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();
        stmt.execute(params_refs.as_slice())?;

        conn.execute(
            "UPDATE playlists SET updated_at = datetime('now') WHERE id = ?1",
            params![playlist_id],
        )?;

        Ok(())
    }

    /// 重新排序歌曲
    pub fn reorder_songs(conn: &Connection, playlist_id: i64, song_ids: &[i64]) -> Result<()> {
        // 使用事务确保原子性
        let mut stmt = conn.prepare(
            "UPDATE playlist_songs SET position = ?1 WHERE playlist_id = ?2 AND song_id = ?3",
        )?;

        for (index, song_id) in song_ids.iter().enumerate() {
            stmt.execute(params![index as i64, playlist_id, song_id])?;
        }

        conn.execute(
            "UPDATE playlists SET updated_at = datetime('now') WHERE id = ?1",
            params![playlist_id],
        )?;

        Ok(())
    }

    /// 更新歌曲在播放列表中的位置
    #[allow(dead_code)]
    pub fn update_song_position(
        conn: &Connection,
        playlist_id: i64,
        song_id: i64,
        new_position: i64,
    ) -> Result<()> {
        conn.execute(
            "UPDATE playlist_songs SET position = ?1 WHERE playlist_id = ?2 AND song_id = ?3",
            params![new_position, playlist_id, song_id],
        )?;
        Ok(())
    }
}

// ============================================================================
// PlayQueueRepo - 播放队列仓库
// ============================================================================

pub struct PlayQueueRepo;

impl PlayQueueRepo {
    /// 保存播放队列（替换现有队列）
    pub fn save(conn: &Connection, song_ids: &[i64]) -> Result<()> {
        // 清空现有队列
        conn.execute("DELETE FROM play_queue", [])?;

        // 插入新队列
        for (position, song_id) in song_ids.iter().enumerate() {
            conn.execute(
                "INSERT INTO play_queue (song_id, position) VALUES (?1, ?2)",
                params![song_id, position as i64],
            )?;
        }

        Ok(())
    }

    /// 获取播放队列中的所有歌曲
    pub fn get_songs(conn: &Connection) -> Result<Vec<Song>> {
        let sql = format!(
            "SELECT s.id, s.path, s.title, s.artist, s.album, s.duration, s.cover, s.cover_path, s.folder_id,
                    s.album_artist, s.year, s.genre, s.track_number, s.track_total, s.disc_number, s.disc_total,
                    s.play_count, s.last_played_at, s.is_favorite, s.rating, s.status, s.created_at, s.updated_at
             FROM songs s
             INNER JOIN play_queue pq ON s.id = pq.song_id
             ORDER BY pq.position"
        );
        let mut stmt = conn.prepare(&sql)?;
        let songs = stmt
            .query_map([], SongRepo::map_row)?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 清空播放队列
    pub fn clear(conn: &Connection) -> Result<()> {
        conn.execute("DELETE FROM play_queue", [])?;
        Ok(())
    }

    /// 获取队列中的歌曲 ID 列表
    #[allow(dead_code)]
    pub fn get_song_ids(conn: &Connection) -> Result<Vec<i64>> {
        let mut stmt = conn.prepare("SELECT song_id FROM play_queue ORDER BY position")?;
        let ids = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>>>()?;
        Ok(ids)
    }
}
