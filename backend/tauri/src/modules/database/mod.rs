// Database 模块
// ============================================================================

// 核心子模块
pub mod schema;
pub mod transcode_cache;
pub mod video;

// Repository 子模块（拆分后）
mod folder_repo;
mod models;
mod playlist_repo;
mod queue_repo;
mod song_repo;

// 重新导出 - 数据模型
pub use models::{LibraryFolder, Playlist, Song};

// 允许未使用的模型（可能在未来使用）
#[allow(unused_imports)]
pub use models::{PlayQueueItem, PlaylistSong};

// 重新导出 - 仓库
pub use folder_repo::FolderRepo;
pub use playlist_repo::PlaylistRepo;
pub use queue_repo::PlayQueueRepo;
pub use song_repo::SongRepo;

// 重新导出其他模块
pub use schema::*;
pub use transcode_cache::*;
pub use video::*;
