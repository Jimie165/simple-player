// PlaylistRepo - 播放列表仓库
// ============================================================================

use rusqlite::{Connection, Result, params};
use super::models::{Playlist, Song};
use super::song_repo::SongRepo;

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
            "INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?1, ?2, ?3)",
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
                "INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?1, ?2, ?3)",
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

    /// 获取播放列表中的所有歌曲 (带 unique_id / playlist_song.id)
    pub fn get_songs(conn: &Connection, playlist_id: i64) -> Result<Vec<Song>> {
        let sql = format!(
            "SELECT s.id, s.path, s.title, s.artist, s.album, s.duration, s.cover, s.cover_path, s.folder_id,
                    s.album_artist, s.year, s.genre, s.track_number, s.track_total, s.disc_number, s.disc_total,
                    s.play_count, s.last_played_at, s.is_favorite, s.rating, s.lyrics_text, s.lyrics_source_path, s.lyrics_offset_ms,
                    s.status, s.created_at, s.updated_at,
                    ps.id as playlist_entry_id
             FROM songs s
             INNER JOIN playlist_songs ps ON s.id = ps.song_id
             WHERE ps.playlist_id = ?1 AND s.status = 'active'
             ORDER BY ps.position"
        );
        let mut stmt = conn.prepare(&sql)?;
        let songs = stmt
            .query_map(params![playlist_id], |row| {
                let mut song = SongRepo::map_row(row)?;
                // map_row reads 0-25; the playlist entry id follows at 26.
                song.unique_id = Some(row.get(26)?);
                Ok(song)
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(songs)
    }

    /// 获取播放列表前四张不同封面，仅用于列表卡片预览。
    pub fn get_cover_paths(conn: &Connection, playlist_id: i64) -> Result<Vec<String>> {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT s.cover_path
             FROM songs s
             INNER JOIN playlist_songs ps ON s.id = ps.song_id
             WHERE ps.playlist_id = ?1
               AND s.status = 'active'
               AND s.cover_path IS NOT NULL
               AND s.cover_path <> ''
             ORDER BY ps.position
             LIMIT 4"
        )?;
        stmt.query_map(params![playlist_id], |row| row.get(0))?
            .collect::<Result<Vec<_>>>()
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

    /// 批量移除歌曲 (通过 playlist_songs.id，可精确移除重复项)
    pub fn batch_remove_playlist_items(
        conn: &Connection,
        playlist_id: i64,
        unique_ids: &[i64],
    ) -> Result<()> {
        if unique_ids.is_empty() {
            return Ok(());
        }
        let placeholders: String = unique_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "DELETE FROM playlist_songs WHERE playlist_id = ?1 AND id IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql)?;

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        params_vec.push(Box::new(playlist_id));
        for id in unique_ids {
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
