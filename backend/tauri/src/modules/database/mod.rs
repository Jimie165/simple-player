// Database 模块
// ============================================================================

// 核心子模块
pub mod schema;
pub mod video;
pub mod transcode_cache;

// Repository 子模块（拆分后）
mod models;
mod folder_repo;
mod song_repo;
mod playlist_repo;
mod queue_repo;

// 重新导出 - 数据模型
pub use models::{
    LibraryFolder,
    Song,
    Playlist,
};

// 允许未使用的模型（可能在未来使用）
#[allow(unused_imports)]
pub use models::{PlaylistSong, PlayQueueItem};

// 重新导出 - 仓库
pub use folder_repo::FolderRepo;
pub use song_repo::SongRepo;
pub use playlist_repo::PlaylistRepo;
pub use queue_repo::PlayQueueRepo;

// 重新导出其他模块
pub use schema::*;
pub use video::*;
pub use transcode_cache::*;
