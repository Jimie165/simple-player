// SongRepo - 歌曲仓库
// ============================================================================

use super::models::Song;
use rusqlite::{params, Connection, Result};

pub struct SongRepo;

impl SongRepo {
    /// 从数据库行映射到 Song 结构体
    pub(crate) fn map_row(row: &rusqlite::Row) -> rusqlite::Result<Song> {
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
            lyrics_text: row.get(20)?,
            lyrics_source_path: row.get(21)?,
            status: row
                .get::<_, Option<String>>(22)?
                .unwrap_or("active".to_string()),
            created_at: row.get(23)?,
            updated_at: row.get(24)?,
            unique_id: None,
        })
    }

    pub(crate) const SELECT_COLUMNS: &'static str =
        "id, path, title, artist, album, duration, cover, cover_path, folder_id, 
         album_artist, year, genre, track_number, track_total, disc_number, disc_total,
         play_count, last_played_at, is_favorite, rating, lyrics_text, lyrics_source_path,
         status, created_at, updated_at";

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

    /// 从音乐库彻底删除歌曲，并清理所有关联状态
    pub fn delete(conn: &Connection, id: i64) -> Result<()> {
        conn.execute("DELETE FROM playlist_songs WHERE song_id = ?1", params![id])?;
        conn.execute("DELETE FROM play_queue WHERE song_id = ?1", params![id])?;
        conn.execute("DELETE FROM songs WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// 批量从音乐库彻底删除歌曲，并清理所有关联状态
    pub fn batch_delete(conn: &Connection, ids: &[i64]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }

        let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let params_refs: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();

        let delete_playlist_songs_sql = format!(
            "DELETE FROM playlist_songs WHERE song_id IN ({})",
            placeholders
        );
        let mut delete_playlist_songs_stmt = conn.prepare(&delete_playlist_songs_sql)?;
        delete_playlist_songs_stmt.execute(params_refs.as_slice())?;

        let delete_play_queue_sql =
            format!("DELETE FROM play_queue WHERE song_id IN ({})", placeholders);
        let mut delete_play_queue_stmt = conn.prepare(&delete_play_queue_sql)?;
        delete_play_queue_stmt.execute(params_refs.as_slice())?;

        let delete_songs_sql = format!("DELETE FROM songs WHERE id IN ({})", placeholders);
        let mut delete_songs_stmt = conn.prepare(&delete_songs_sql)?;
        delete_songs_stmt.execute(params_refs.as_slice())?;
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

    /// 归档歌曲（标记为已归档，保留收藏/播放统计/播放列表关联）
    pub fn archive(conn: &Connection, id: i64) -> Result<()> {
        conn.execute(
            "UPDATE songs SET status = 'archived', updated_at = datetime('now') WHERE id = ?1",
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

    /// 更新用户可编辑的歌曲信息和自定义歌词
    #[allow(clippy::too_many_arguments)]
    pub fn update_details(
        conn: &Connection,
        id: i64,
        title: &str,
        artist: &str,
        album: &str,
        album_artist: Option<&str>,
        year: Option<i32>,
        genre: Option<&str>,
        track_number: Option<i32>,
        track_total: Option<i32>,
        disc_number: Option<i32>,
        disc_total: Option<i32>,
        lyrics_text: Option<&str>,
        lyrics_source_path: Option<&str>,
    ) -> Result<()> {
        conn.execute(
            "UPDATE songs SET
                title = ?1, artist = ?2, album = ?3, album_artist = ?4,
                year = ?5, genre = ?6, track_number = ?7, track_total = ?8,
                disc_number = ?9, disc_total = ?10, lyrics_text = ?11,
                lyrics_source_path = ?12, updated_at = datetime('now')
            WHERE id = ?13",
            params![
                title,
                artist,
                album,
                album_artist,
                year,
                genre,
                track_number,
                track_total,
                disc_number,
                disc_total,
                lyrics_text,
                lyrics_source_path,
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
             WHERE (title LIKE ?1 OR artist LIKE ?1 OR album LIKE ?1 OR album_artist LIKE ?1)
             AND status = 'active'
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
