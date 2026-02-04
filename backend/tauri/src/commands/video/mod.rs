// Video 命令模块
// ============================================================================
// 此模块包含所有视频相关的 Tauri 命令
// ============================================================================

// 子模块声明
pub mod ffprobe;
pub mod scan;
pub mod query;
pub mod prepare;
pub mod cache;
pub mod transcode;

// 注意：Tauri 命令需要从各自的子模块直接引用
// 在 main.rs 中使用 commands::video::scan::scan_videos 等路径

