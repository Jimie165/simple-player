// FolderRepo - 文件夹仓库
// ============================================================================

use super::models::LibraryFolder;
use crate::utils::path::normalize_folder_path;
use rusqlite::{Connection, Result, params};

pub struct FolderRepo;

impl FolderRepo {
    /// 获取所有文件夹
    pub fn get_all(conn: &Connection) -> Result<Vec<LibraryFolder>> {
        let mut stmt = conn.prepare(
            "SELECT id, path, folder_type, created_at FROM library_folders ORDER BY created_at",
        )?;
        let folders = stmt
            .query_map([], |row| {
                Ok(LibraryFolder {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    folder_type: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(folders)
    }

    /// 获取特定类型的文件夹
    pub fn get_by_type(conn: &Connection, folder_type: &str) -> Result<Vec<LibraryFolder>> {
        let mut stmt =
            conn.prepare("SELECT id, path, folder_type, created_at FROM library_folders WHERE folder_type IN (?1, 'mixed') ORDER BY created_at")?;
        let folders = stmt
            .query_map([folder_type], |row| {
                Ok(LibraryFolder {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    folder_type: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(folders)
    }

    /// 添加文件夹
    pub fn add(conn: &Connection, path: &str) -> Result<LibraryFolder> {
        Self::add_with_type(conn, path, "music")
    }

    /// 添加文件夹并指定类型
    pub fn add_with_type(
        conn: &Connection,
        path: &str,
        folder_type: &str,
    ) -> Result<LibraryFolder> {
        let path = normalize_folder_path(path);
        // 同一路径可以属于两个库；保留原 ID 和媒体关联，不能覆盖另一种归属。
        conn.execute(
            "INSERT INTO library_folders (path, folder_type) VALUES (?1, ?2)
             ON CONFLICT(path) DO UPDATE SET folder_type = CASE
                 WHEN library_folders.folder_type = excluded.folder_type THEN excluded.folder_type
                 ELSE 'mixed' END",
            params![path, folder_type],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, path, folder_type, created_at FROM library_folders WHERE path = ?1",
        )?;
        stmt.query_row(params![path], |row| {
            Ok(LibraryFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                folder_type: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
    }

    /// Removes music membership while preserving a shared video directory.
    pub fn remove(conn: &Connection, path: &str) -> Result<bool> {
        Self::remove_type(conn, path, "music")
    }

    pub fn remove_video(conn: &Connection, path: &str) -> Result<bool> {
        Self::remove_type(conn, path, "video")
    }

    fn remove_type(conn: &Connection, path: &str, folder_type: &str) -> Result<bool> {
        let tx = conn.unchecked_transaction()?;
        let Some(folder) = Self::get_by_path(&tx, path)? else {
            return Ok(false);
        };
        if folder.folder_type != folder_type && folder.folder_type != "mixed" {
            return Ok(false);
        }
        if folder_type == "music" {
            tx.execute("DELETE FROM songs WHERE folder_id = ?1", [folder.id])?;
        } else {
            tx.execute(
                "UPDATE videos SET status = 'archived', updated_at = datetime('now') WHERE folder_id = ?1",
                [folder.id],
            )?;
        }
        if folder.folder_type == "mixed" {
            let remaining_type = if folder_type == "music" {
                "video"
            } else {
                "music"
            };
            tx.execute(
                "UPDATE library_folders SET folder_type = ?1 WHERE id = ?2",
                params![remaining_type, folder.id],
            )?;
        } else {
            tx.execute("DELETE FROM library_folders WHERE id = ?1", [folder.id])?;
        }
        tx.commit()?;
        Ok(true)
    }

    /// 根据路径获取文件夹（精确匹配，不做归一化）
    #[allow(dead_code)]
    pub fn get_by_path(conn: &Connection, path: &str) -> Result<Option<LibraryFolder>> {
        let mut stmt = conn.prepare(
            "SELECT id, path, folder_type, created_at FROM library_folders WHERE path = ?1",
        )?;
        let result = stmt.query_row(params![path], |row| {
            Ok(LibraryFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                folder_type: row.get(2)?,
                created_at: row.get(3)?,
            })
        });
        match result {
            Ok(folder) => Ok(Some(folder)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::database::schema::init_schema;

    #[test]
    fn shared_folder_survives_removal_from_either_library() {
        for first_type in ["music", "video"] {
            let conn = Connection::open_in_memory().unwrap();
            conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
            init_schema(&conn).unwrap();
            let first = FolderRepo::add_with_type(&conn, "/媒体", first_type).unwrap();
            let other_type = if first_type == "music" {
                "video"
            } else {
                "music"
            };
            let shared = FolderRepo::add_with_type(&conn, "/媒体", other_type).unwrap();
            assert_eq!(first.id, shared.id);
            assert_eq!(shared.folder_type, "mixed");
            assert_eq!(FolderRepo::get_by_type(&conn, "music").unwrap().len(), 1);
            assert_eq!(FolderRepo::get_by_type(&conn, "video").unwrap().len(), 1);
            conn.execute("INSERT INTO songs (path, title, artist, album, duration, folder_id) VALUES ('/媒体/歌曲.flac', '歌曲', 'Artist', 'Album', 10, ?1)", [shared.id]).unwrap();
            conn.execute(
                "INSERT INTO videos (path, title, folder_id) VALUES ('/媒体/影片.mp4', '影片', ?1)",
                [shared.id],
            )
            .unwrap();
            assert!(FolderRepo::remove_type(&conn, "/媒体", first_type).unwrap());
            assert!(
                FolderRepo::get_by_type(&conn, first_type)
                    .unwrap()
                    .is_empty()
            );
            let remaining = FolderRepo::get_by_type(&conn, other_type).unwrap();
            assert_eq!(remaining[0].id, shared.id);
            assert_eq!(remaining[0].folder_type, other_type);
            let table = if other_type == "music" {
                "songs"
            } else {
                "videos"
            };
            let count: i64 = conn
                .query_row(
                    &format!(
                        "SELECT count(*) FROM {table} WHERE folder_id = ?1 AND status = 'active'"
                    ),
                    [shared.id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1);
            assert!(!FolderRepo::remove_type(&conn, "/媒体", first_type).unwrap());
            assert!(FolderRepo::remove_type(&conn, "/媒体", other_type).unwrap());
            assert!(FolderRepo::get_all(&conn).unwrap().is_empty());
        }
    }
}
