export interface SongMetadata {
    title: string;
    artist: string;
    album: string;
    duration: number; // 秒
    cover: string | null; // Base64 字符串
}