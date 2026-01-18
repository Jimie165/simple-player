// 歌曲元数据
export interface SongMetadata {
    title: string;
    artist: string;
    album: string;
    duration: number; // 秒
    cover: string | null; // Base64
    path?: string; // 文件路径
}

// 最近播放/历史记录项
export interface RecentItem {
    id: string; // 通常是路径
    type: 'file' | 'folder';
    title: string;
    description: string;
    cover?: string | null;
    path: string;
    lastPlayed: number; // 时间戳
}

// 播放模式
export type RepeatMode = 'off' | 'all' | 'one';

// 页面 ID
export type PageId = 'home' | 'library' | 'videos' | 'queue' | 'playlists' | 'settings';