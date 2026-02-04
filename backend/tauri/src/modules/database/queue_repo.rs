// PlayQueueRepo - 播放队列仓库
// ============================================================================

use rusqlite::{Connection, Result, params};
use super::models::Song;
use super::song_repo::SongRepo;

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
