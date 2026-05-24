// 歌曲元数据
export interface SongMetadata {
    id?: number;
    title: string;
    artist: string;
    album: string;
    duration: number; // 秒
    cover?: string | null; // Deprecated: 保留字段，不再使用 base64
    cover_path?: string | null; // 封面文件路径
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

export interface LyricsWord {
    time_ms: number;
    text: string;
}

export interface LyricsLine {
    time_ms: number | null;
    text: string;
    translation?: string | null;
    words?: LyricsWord[] | null;
    // Explicit line-end time, e.g. from a trailing <mm:ss.xx> tag in
    // enhanced LRC. Used to mark exactly when the previous lyric stops
    // sounding so interlude dots can appear right after the last word.
    end_ms?: number | null;
}

export interface LyricsData {
    lines: LyricsLine[];
    has_timestamps: boolean;
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
