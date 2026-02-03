use rusqlite::{Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use crate::utils::path::normalize_db_path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Video {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub duration: i64,
    pub size: Option<i64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub thumbnail_path: Option<String>,

    pub is_favorite: bool,
    pub play_count: i32,
    pub last_played_at: Option<String>,

    pub folder_id: Option<i64>,
    pub status: String,

    pub created_at: String,
    pub updated_at: String,
}

pub struct VideoRepo;

impl VideoRepo {
    pub fn get_all(conn: &Connection) -> Result<Vec<Video>> {
        let mut stmt = conn.prepare(
            "SELECT id, path, title, duration, size, width, height, thumbnail_path, 
                    is_favorite, play_count, last_played_at, folder_id, status, created_at, updated_at
             FROM videos
             WHERE status = 'active'
             ORDER BY title"
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(Video {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                duration: row.get(3)?,
                size: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                thumbnail_path: row.get(7)?,
                is_favorite: row.get(8)?,
                play_count: row.get(9)?,
                last_played_at: row.get(10)?,
                folder_id: row.get(11)?,
                status: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?;

        iter.collect()
    }

    pub fn get_by_path_any_status(conn: &Connection, path: &str) -> Result<Option<Video>> {
        conn.query_row(
            "SELECT id, path, title, duration, size, width, height, thumbnail_path, 
                    is_favorite, play_count, last_played_at, folder_id, status, created_at, updated_at
             FROM videos
             WHERE path = ?1",
            [path],
            |row| {
                Ok(Video {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    title: row.get(2)?,
                    duration: row.get(3)?,
                    size: row.get(4)?,
                    width: row.get(5)?,
                    height: row.get(6)?,
                    thumbnail_path: row.get(7)?,
                    is_favorite: row.get(8)?,
                    play_count: row.get(9)?,
                    last_played_at: row.get(10)?,
                    folder_id: row.get(11)?,
                    status: row.get(12)?,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            },
        ).optional()
    }

    pub fn upsert(
        conn: &Connection,
        path: &str,
        title: &str,
        duration: i64,
        size: Option<i64>,
        width: Option<i32>,
        height: Option<i32>,
        thumbnail_path: Option<&str>,
        folder_id: Option<i64>,
    ) -> Result<()> {
        // 使用 ON CONFLICT 更新除用户数据以外的字段
        conn.execute(
            "INSERT INTO videos (path, title, duration, size, width, height, thumbnail_path, folder_id, status, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', datetime('now'))
             ON CONFLICT(path) DO UPDATE SET
                title = excluded.title,
                duration = excluded.duration,
                size = excluded.size,
                width = excluded.width,
                height = excluded.height,
                thumbnail_path = excluded.thumbnail_path,
                folder_id = excluded.folder_id,
                status = 'active',
                updated_at = datetime('now')
            ",
            (path, title, duration, size, width, height, thumbnail_path, folder_id),
        )?;
        Ok(())
    }

    // 软删除（归档）
    pub fn delete(conn: &Connection, id: i64) -> Result<()> {
        conn.execute(
            "UPDATE videos SET status = 'archived', updated_at = datetime('now') WHERE id = ?1",
            [id],
        )?;
        Ok(())
    }

    // 恢复已归档的视频
    pub fn restore(conn: &Connection, id: i64) -> Result<()> {
        conn.execute(
            "UPDATE videos SET status = 'active', updated_at = datetime('now') WHERE id = ?1",
            [id],
        )?;
        Ok(())
    }

    pub fn batch_delete(conn: &Connection, ids: &[i64]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let ids_str: Vec<String> = ids.iter().map(|id| id.to_string()).collect();
        let query = format!(
            "UPDATE videos SET status = 'archived', updated_at = datetime('now') WHERE id IN ({})",
            ids_str.join(",")
        );
        conn.execute(&query, [])?;
        Ok(())
    }

    pub fn toggle_favorite(conn: &Connection, id: i64) -> Result<bool> {
        let is_fav: bool = conn
            .query_row(
                "SELECT is_favorite FROM videos WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        let new_fav = !is_fav;
        conn.execute(
            "UPDATE videos SET is_favorite = ?1, updated_at = datetime('now') WHERE id = ?2",
            (new_fav, id),
        )?;
        Ok(new_fav)
    }

    // 检查哪些路径在数据库中存在 but actual 扫描列表中没有（用于标记清理）
    // 返回这些歌曲的 ID
    pub fn get_videos_not_in_paths(
        conn: &Connection,
        folder_id: i64,
        active_paths: &[String],
    ) -> Result<Vec<Video>> {
        // 由于 SQLite 限制参数数量，一次不能传太多。这里简化逻辑：
        // 获取该文件夹下所有 active 视频，并在内存中过滤

        let mut stmt = conn.prepare(
            "SELECT id, path, title, duration, size, width, height, thumbnail_path, 
                    is_favorite, play_count, last_played_at, folder_id, status, created_at, updated_at
             FROM videos
             WHERE folder_id = ?1 AND status = 'active'",
        )?;

        let videos = stmt.query_map([folder_id], |row| {
            Ok(Video {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                duration: row.get(3)?,
                size: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                thumbnail_path: row.get(7)?,
                is_favorite: row.get(8)?,
                play_count: row.get(9)?,
                last_played_at: row.get(10)?,
                folder_id: row.get(11)?,
                status: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?;

        let mut stale = Vec::new();
        for v in videos {
            let v = v?;
            let v_norm = normalize_db_path(std::path::Path::new(&v.path));
            if !active_paths.iter().any(|p| normalize_db_path(std::path::Path::new(p)) == v_norm) {
                stale.push(v);
            }
        }

        Ok(stale)
    }
}
