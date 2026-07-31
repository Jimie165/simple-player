// SongRepo - 歌曲仓库
// ============================================================================

use super::models::Song;
use rusqlite::{Connection, Result, params};

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
            lyrics_offset_ms: row.get::<_, Option<i32>>(22)?.unwrap_or(0),
            status: row
                .get::<_, Option<String>>(23)?
                .unwrap_or("active".to_string()),
            created_at: row.get(24)?,
            updated_at: row.get(25)?,
            artwork_path: row.get(26)?,
            metadata_overridden: row.get::<_, Option<i32>>(27)?.map(|value| value != 0),
            unique_id: None,
        })
    }

    pub(crate) const SELECT_COLUMNS: &'static str =
        "id, path, title, artist, album, duration, cover, cover_path, folder_id, 
         album_artist, year, genre, track_number, track_total, disc_number, disc_total,
         play_count, last_played_at, is_favorite, rating, lyrics_text, lyrics_source_path, lyrics_offset_ms,
         status, created_at, updated_at, artwork_path, metadata_overridden";

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

    /// 获取所有未出现在音乐库中的歌曲
    #[allow(dead_code)]
    pub fn get_archived(conn: &Connection) -> Result<Vec<Song>> {
        let sql = format!(
            "SELECT {} FROM songs WHERE status != 'active' ORDER BY title",
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

    /// 获取文件夹中被用户主动排除的歌曲
    pub fn get_excluded_by_folder(conn: &Connection, folder_id: i64) -> Result<Vec<Song>> {
        let sql = format!(
            "SELECT {} FROM songs WHERE folder_id = ?1 AND status = 'excluded' ORDER BY title",
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
                status, updated_at, metadata_overridden
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                'active', datetime('now'), 0
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

    /// 从音乐库排除歌曲，并清理播放列表和队列关联
    pub fn delete(conn: &Connection, id: i64) -> Result<()> {
        let tx = conn.unchecked_transaction()?;
        tx.execute("DELETE FROM playlist_songs WHERE song_id = ?1", params![id])?;
        tx.execute("DELETE FROM play_queue WHERE song_id = ?1", params![id])?;
        tx.execute(
            "UPDATE songs SET status = 'excluded', is_favorite = 0, updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// 批量从音乐库排除歌曲，并清理播放列表和队列关联
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
        let tx = conn.unchecked_transaction()?;
        let mut delete_playlist_songs_stmt = tx.prepare(&delete_playlist_songs_sql)?;
        delete_playlist_songs_stmt.execute(params_refs.as_slice())?;
        drop(delete_playlist_songs_stmt);

        let delete_play_queue_sql =
            format!("DELETE FROM play_queue WHERE song_id IN ({})", placeholders);
        let mut delete_play_queue_stmt = tx.prepare(&delete_play_queue_sql)?;
        delete_play_queue_stmt.execute(params_refs.as_slice())?;
        drop(delete_play_queue_stmt);

        let exclude_songs_sql = format!(
            "UPDATE songs SET status = 'excluded', is_favorite = 0, updated_at = datetime('now') WHERE id IN ({})",
            placeholders
        );
        let mut exclude_songs_stmt = tx.prepare(&exclude_songs_sql)?;
        exclude_songs_stmt.execute(params_refs.as_slice())?;
        drop(exclude_songs_stmt);
        tx.commit()?;
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

    /// 仅恢复用户主动排除的歌曲
    pub fn batch_restore_excluded(conn: &Connection, ids: &[i64]) -> Result<usize> {
        if ids.is_empty() {
            return Ok(0);
        }

        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "UPDATE songs SET status = 'active', updated_at = datetime('now')
             WHERE status = 'excluded' AND id IN ({})",
            placeholders
        );
        let params_refs: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        conn.execute(&sql, params_refs.as_slice())
    }

    /// 标记磁盘上暂时缺失的歌曲
    pub fn archive(conn: &Connection, id: i64) -> Result<()> {
        conn.execute(
            "UPDATE songs SET status = 'missing', updated_at = datetime('now') WHERE id = ?1",
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
        let Some(existing) = Self::get_by_id(conn, id)? else {
            return Ok(());
        };
        let is_placeholder = existing.artist == "Unknown" || existing.album == "Unknown";
        let metadata_differs = existing.title != title
            || existing.artist != artist
            || existing.album != album
            || existing.album_artist.as_deref() != album_artist
            || existing.year != year
            || existing.genre.as_deref() != genre
            || existing.track_number != track_number
            || existing.track_total != track_total
            || existing.disc_number != disc_number
            || existing.disc_total != disc_total;
        let preserve_metadata = existing
            .metadata_overridden
            .unwrap_or(!is_placeholder && metadata_differs);

        if preserve_metadata {
            conn.execute(
                "UPDATE songs SET
                    duration = ?1, cover = ?2, cover_path = ?3,
                    metadata_overridden = 1, updated_at = datetime('now')
                 WHERE id = ?4",
                params![duration, cover, cover_path, id],
            )?;
        } else {
            conn.execute(
                "UPDATE songs SET
                    title = ?1, artist = ?2, album = ?3, duration = ?4,
                    cover = ?5, cover_path = ?6, album_artist = ?7,
                    year = ?8, genre = ?9, track_number = ?10, track_total = ?11,
                    disc_number = ?12, disc_total = ?13, metadata_overridden = 0,
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
        }
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
        lyrics_offset_ms: i32,
        metadata_overridden: bool,
    ) -> Result<()> {
        conn.execute(
            "UPDATE songs SET
                title = ?1, artist = ?2, album = ?3, album_artist = ?4,
                year = ?5, genre = ?6, track_number = ?7, track_total = ?8,
                disc_number = ?9, disc_total = ?10, lyrics_text = ?11,
                lyrics_source_path = ?12, lyrics_offset_ms = ?13,
                metadata_overridden = ?14,
                updated_at = datetime('now')
            WHERE id = ?15",
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
                lyrics_offset_ms,
                metadata_overridden,
                id
            ],
        )?;
        Ok(())
    }

    pub fn set_artwork_path(conn: &Connection, id: i64, artwork_path: Option<&str>) -> Result<()> {
        conn.execute(
            "UPDATE songs SET artwork_path = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![artwork_path, id],
        )?;
        Ok(())
    }

    pub fn count_artwork_references(conn: &Connection, artwork_path: &str) -> Result<i64> {
        conn.query_row(
            "SELECT COUNT(*) FROM songs WHERE artwork_path = ?1",
            params![artwork_path],
            |row| row.get(0),
        )
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::database::init_schema;

    #[test]
    fn delete_excludes_song_and_clears_library_relations() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(
            "CREATE TABLE songs (
                id INTEGER PRIMARY KEY,
                status TEXT NOT NULL,
                is_favorite INTEGER NOT NULL,
                updated_at TEXT
            );
            CREATE TABLE playlist_songs (song_id INTEGER NOT NULL);
            CREATE TABLE play_queue (song_id INTEGER NOT NULL);
            INSERT INTO songs (id, status, is_favorite) VALUES (1, 'active', 1);
            INSERT INTO playlist_songs (song_id) VALUES (1);
            INSERT INTO play_queue (song_id) VALUES (1);",
        )
        .expect("create song relations");

        SongRepo::delete(&conn, 1).expect("exclude song");

        let (status, is_favorite): (String, i32) = conn
            .query_row(
                "SELECT status, is_favorite FROM songs WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read excluded song");
        let playlist_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM playlist_songs", [], |row| row.get(0))
            .expect("count playlist relations");
        let queue_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM play_queue", [], |row| row.get(0))
            .expect("count queue relations");

        assert_eq!(status, "excluded");
        assert_eq!(is_favorite, 0);
        assert_eq!(playlist_count, 0);
        assert_eq!(queue_count, 0);
    }

    #[test]
    fn batch_restore_only_restores_excluded_songs() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch(
            "CREATE TABLE songs (
                id INTEGER PRIMARY KEY,
                status TEXT NOT NULL,
                updated_at TEXT
            );
            INSERT INTO songs (id, status) VALUES
                (1, 'excluded'),
                (2, 'missing');",
        )
        .expect("create songs");

        let restored =
            SongRepo::batch_restore_excluded(&conn, &[1, 2]).expect("restore excluded songs");
        let statuses: Vec<String> = conn
            .prepare("SELECT status FROM songs ORDER BY id")
            .expect("prepare status query")
            .query_map([], |row| row.get(0))
            .expect("query statuses")
            .collect::<Result<Vec<_>>>()
            .expect("collect statuses");

        assert_eq!(restored, 1);
        assert_eq!(statuses, vec!["active", "missing"]);
    }

    #[test]
    fn refresh_preserves_player_metadata_until_override_is_cleared() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        init_schema(&conn).expect("initialize schema");
        SongRepo::upsert(
            &conn,
            "C:/music/song.mp3",
            "File title",
            "File artist",
            "File album",
            100,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("insert song");
        let song = SongRepo::get_by_path(&conn, "C:/music/song.mp3")
            .expect("query song")
            .expect("song exists");

        conn.execute(
            "UPDATE songs SET title = 'Legacy player title', metadata_overridden = NULL WHERE id = ?1",
            params![song.id],
        )
        .expect("simulate metadata saved before v16");
        SongRepo::update_metadata(
            &conn,
            song.id,
            "File title",
            "File artist",
            "File album",
            110,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("classify legacy metadata");
        let legacy = SongRepo::get_by_id(&conn, song.id)
            .expect("query legacy song")
            .expect("legacy song exists");
        assert_eq!(legacy.title, "Legacy player title");
        assert_eq!(legacy.duration, 110);
        assert_eq!(legacy.metadata_overridden, Some(true));

        SongRepo::update_details(
            &conn,
            song.id,
            "Player title",
            "Player artist",
            "File album",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            0,
            true,
        )
        .expect("save player metadata");
        SongRepo::update_metadata(
            &conn,
            song.id,
            "Changed file title",
            "Changed file artist",
            "Changed file album",
            120,
            None,
            None,
            None,
            Some(2026),
            None,
            None,
            None,
            None,
            None,
        )
        .expect("refresh protected song");

        let protected = SongRepo::get_by_id(&conn, song.id)
            .expect("query protected song")
            .expect("protected song exists");
        assert_eq!(protected.title, "Player title");
        assert_eq!(protected.artist, "Player artist");
        assert_eq!(protected.album, "File album");
        assert_eq!(protected.duration, 120);
        assert_eq!(protected.metadata_overridden, Some(true));

        SongRepo::update_details(
            &conn,
            song.id,
            "Changed file title",
            "Changed file artist",
            "Changed file album",
            None,
            Some(2026),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            0,
            false,
        )
        .expect("clear player metadata override");
        SongRepo::update_metadata(
            &conn,
            song.id,
            "Latest file title",
            "Latest file artist",
            "Latest file album",
            130,
            None,
            None,
            None,
            Some(2027),
            None,
            None,
            None,
            None,
            None,
        )
        .expect("refresh unprotected song");

        let refreshed = SongRepo::get_by_id(&conn, song.id)
            .expect("query refreshed song")
            .expect("refreshed song exists");
        assert_eq!(refreshed.title, "Latest file title");
        assert_eq!(refreshed.artist, "Latest file artist");
        assert_eq!(refreshed.album, "Latest file album");
        assert_eq!(refreshed.year, Some(2027));
        assert_eq!(refreshed.duration, 130);
        assert_eq!(refreshed.metadata_overridden, Some(false));
    }
}
