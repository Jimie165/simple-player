use rusqlite::{params, Connection, OptionalExtension, Result};

#[derive(Debug, Clone)]
pub struct CacheRecord {
    pub id: i64,
    pub cache_path: String,
    pub file_size: i64,
}

pub struct TranscodeCacheRepo;

impl TranscodeCacheRepo {
    /// 查找缓存并更新访问时间
    pub fn find_and_touch(conn: &Connection, source_hash: &str) -> Result<Option<String>> {
        conn.execute(
            "UPDATE transcoded_cache SET last_accessed_at = unixepoch() WHERE source_hash = ?",
            params![source_hash],
        )?;
        
        conn.query_row(
            "SELECT cache_path FROM transcoded_cache WHERE source_hash = ?",
            params![source_hash],
            |row| row.get(0)
        ).optional()
    }
    
    /// 添加新缓存记录（处理并发冲突）
    pub fn insert(
        conn: &Connection,
        source_path: &str,
        source_hash: &str,
        cache_path: &str,
        file_size: i64,
        codec_info: &str
    ) -> Result<String> {
        // INSERT OR IGNORE：如果 source_hash 已存在（被其他线程插入），忽略
        let affected = conn.execute(
            "INSERT OR IGNORE INTO transcoded_cache 
             (source_path, source_hash, cache_path, file_size, codec_info, last_accessed_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, unixepoch(), unixepoch())",
            params![source_path, source_hash, cache_path, file_size, codec_info],
        )?;
        
        if affected == 0 {
            // 已存在，返回已有缓存路径（并发情况）
            return conn.query_row(
                "SELECT cache_path FROM transcoded_cache WHERE source_hash = ?",
                params![source_hash],
                |row| row.get(0)
            );
        }
        
        Ok(cache_path.to_string())
    }
    
    /// 计算总缓存大小（排除正在使用的）
    pub fn get_total_size(conn: &Connection) -> Result<i64> {
        conn.query_row(
            "SELECT COALESCE(SUM(file_size), 0) FROM transcoded_cache WHERE is_in_use = 0",
            [],
            |row| row.get(0)
        )
    }
    
    /// 获取最旧的记录（排除正在使用的）
    pub fn get_oldest_records(conn: &Connection, limit: usize) -> Result<Vec<CacheRecord>> {
        let mut stmt = conn.prepare(
            "SELECT id, cache_path, file_size FROM transcoded_cache 
             WHERE is_in_use = 0 
             ORDER BY last_accessed_at ASC LIMIT ?"
        )?;
        
        stmt.query_map(params![limit], |row| {
            Ok(CacheRecord {
                id: row.get(0)?,
                cache_path: row.get(1)?,
                file_size: row.get(2)?,
            })
        })?.collect()
    }

    /// 获取所有未使用的缓存记录
    pub fn get_unused_records(conn: &Connection) -> Result<Vec<CacheRecord>> {
        let mut stmt = conn.prepare(
            "SELECT id, cache_path, file_size FROM transcoded_cache 
             WHERE is_in_use = 0 
             ORDER BY last_accessed_at ASC"
        )?;

        stmt.query_map([], |row| {
            Ok(CacheRecord {
                id: row.get(0)?,
                cache_path: row.get(1)?,
                file_size: row.get(2)?,
            })
        })?.collect()
    }
    
    /// 删除记录（通过 ID）
    pub fn delete(conn: &Connection, id: i64) -> Result<()> {
        conn.execute("DELETE FROM transcoded_cache WHERE id = ?", params![id])?;
        Ok(())
    }
    
    /// 删除记录（通过 source_hash）
    pub fn delete_by_hash(conn: &Connection, source_hash: &str) -> Result<()> {
        conn.execute("DELETE FROM transcoded_cache WHERE source_hash = ?", params![source_hash])?;
        Ok(())
    }
    
    /// 标记为正在使用/释放
    pub fn mark_in_use(conn: &Connection, source_hash: &str, in_use: bool) -> Result<()> {
        conn.execute(
            "UPDATE transcoded_cache SET is_in_use = ?1 WHERE source_hash = ?2",
            params![in_use as i32, source_hash]
        )?;
        Ok(())
    }
    
    /// 清空所有记录（仅清理未使用的）
    pub fn clear_unused(conn: &Connection) -> Result<usize> {
        let count = conn.execute("DELETE FROM transcoded_cache WHERE is_in_use = 0", [])?;
        Ok(count)
    }
    
    /// 获取缓存文件数量
    pub fn get_count(conn: &Connection) -> Result<usize> {
        conn.query_row(
            "SELECT COUNT(*) FROM transcoded_cache",
            [],
            |row| row.get(0)
        )
    }
}
