// FolderRepo - 文件夹仓库
// ============================================================================

use rusqlite::{Connection, Result, params};
use super::models::LibraryFolder;
use crate::utils::path::normalize_folder_path;

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
            conn.prepare("SELECT id, path, folder_type, created_at FROM library_folders WHERE folder_type = ?1 ORDER BY created_at")?;
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
        // 使用 ON CONFLICT 来更新 folder_type，确保类型正确
        conn.execute(
            "INSERT INTO library_folders (path, folder_type) VALUES (?1, ?2)
             ON CONFLICT(path) DO UPDATE SET folder_type = excluded.folder_type",
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

    /// 删除文件夹（同时删除关联的歌曲）
    /// 直接按传入路径精确匹配 —— 调用方应当传 DB 中存储的原始字符串
    /// （例如 `get_all` 返回的 `LibraryFolder.path`），不要再做归一化。
    /// 返回是否真的删除到了行；调用方据此决定是否给用户反馈。
    pub fn remove(conn: &Connection, path: &str) -> Result<bool> {
        conn.execute(
            "DELETE FROM songs WHERE folder_id = (SELECT id FROM library_folders WHERE path = ?1)",
            params![path],
        )?;
        let affected = conn.execute(
            "DELETE FROM library_folders WHERE path = ?1",
            params![path],
        )?;
        Ok(affected > 0)
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
