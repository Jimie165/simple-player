// 歌曲元数据
export interface SongMetadata {
    id?: number;
    title: string;
    artist: string;
    album: string;
    duration: number; // 秒
    cover?: string | null; // Deprecated: 保留字段，不再使用 base64
    cover_path?: string | null; // 当前生效的封面路径
    embedded_cover_path?: string | null; // 音乐文件内嵌封面的缓存路径
    artwork_path?: string | null; // 应用管理的自定义覆盖封面
    path?: string; // 文件路径
    size?: number; // 字节
    sample_rate?: number; // Hz
    bitrate?: number; // kbps
    // 扩展元数据
    album_artist?: string;
    year?: number;
    genre?: string;
    track_number?: number;
    track_total?: number;
    disc_number?: number;
    disc_total?: number;
    // 用户数据
    play_count?: number;
    last_played_at?: string;
    is_favorite?: boolean;
    rating?: number;
    lyrics_text?: string | null;
    lyrics_source_path?: string | null;
    lyrics_offset_ms?: number;
    // 队列控制
    is_queue_item?: boolean;
    // 播放列表唯一ID (用于处理重复歌曲)
    unique_id?: number;
    // 媒体详细信息
    width?: number;
    height?: number;
    frame_rate?: number;
    channels?: number;
}

// ===== 统一歌词模型（TTML 风格规范化） =====

// 歌词来源
export type LyricsOrigin = 'native-ttml' | 'lrc' | 'sylt' | 'plain';

// 时间模式
export type LyricsTimingMode = 'none' | 'line' | 'word';

// 行角色
export type LyricsLineRole = 'main' | 'background' | 'timing-marker';

// 单个词/字的起止时间
// end_time_ms 可选：缺失 ⇔ 隐式词尾（LRC 无行尾显式戳），由视觉层按旧规则推导
export interface LyricsWord {
    start_time_ms: number;
    end_time_ms?: number;
    text: string;
}

// 一行歌词（主唱/背景人声/时间标记）
export interface LyricsLine {
    id: string;
    parent_id?: string | null;
    role: LyricsLineRole;
    start_time_ms: number | null;
    end_time_ms: number | null;
    text: string;
    words: LyricsWord[];
    translation?: string | null;
    romanization?: string | null;
    agent_id?: string | null;
    is_duet?: boolean;
    section?: string | null;
    backgroundLine?: LyricsLine | null;
}

// 演唱者
export interface LyricsAgent {
    id: string;
    type?: string | null;
    name?: string | null;
}

// 歌词元数据
export interface LyricsMetadata {
    language?: string | null;
    songwriters?: string[] | null;
    agents?: LyricsAgent[] | null;
    duration_ms?: number | null;
}

// 统一歌词文档。所有来源（TTML/LRC/SYLT/纯文本）都转换为该模型。
export interface LyricsDocument {
    model: 'ttml';
    origin: LyricsOrigin;
    timing_mode: LyricsTimingMode;
    lines: LyricsLine[];
    metadata: LyricsMetadata;
    offset_ms: number;
}

// 后端 get_lyrics 返回的带时间行（SYLT 或数据库歌词）
export interface BackendTimedLyricsLine {
    time_ms: number | null;
    text: string;
    translation?: string | null;
}

export interface BackendLyricsData {
    lines: BackendTimedLyricsLine[];
    has_timestamps: boolean;
    offset_ms: number;
}

// 库文件夹
export interface LibraryFolder {
    id: number;
    path: string;
    folder_type: string;
    created_at: string;
}

// 播放列表
export interface Playlist {
    id: number;
    name: string;
    cover_path?: string | null;
    description?: string | null;
    song_count?: number;
    last_played_at?: string | null;
    created_at: string;
    updated_at: string;
}

// 最近播放/历史记录项
export interface RecentItem {
    id: string; // 通常是路径
    type: 'file' | 'folder' | 'album' | 'artist' | 'playlist' | 'video';
    title: string;
    description: string;
    cover?: string | null; // Deprecated: 保留字段，不再使用 base64
    cover_path?: string | null;
    path: string;
    lastPlayed: number; // 时间戳
    // 专辑额外信息
    artist?: string;
    album?: string;
    isLibraryItem?: boolean;
}

// 播放模式
export type RepeatMode = 'off' | 'all' | 'one';

// 页面 ID
export type PageId = 'home' | 'library' | 'videos' | 'playlists' | 'settings' | 'search';

export * from '@/types/video';
