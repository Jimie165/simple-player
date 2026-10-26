import { invoke } from '@tauri-apps/api/core';

export interface OnlineLyricsCandidate {
    provider: string;
    id: string;
    numeric_id?: string | null;
    title: string;
    artist: string;
    album: string;
    duration_ms: number;
}
export interface OnlineLyricsPayload {
    content: string;
    format: string;
    translation: string | null;
    romanization: string | null;
}
export const lyricsProviders = [
    ['all', '全部来源'], ['amll', 'AMLL 社区'], ['qq', 'QQ 音乐'],
    ['kugou', '酷狗音乐'], ['netease', '网易云音乐'], ['lrclib', 'LRCLIB'],
] as const;
export function orderedLyricsProviders(order: readonly string[]) {
    const sources = lyricsProviders.filter(([id]) => id !== 'all');
    return [...sources].sort(([a], [b]) => {
        const position = (id: string) => order.includes(id) ? order.indexOf(id) : order.length + sources.findIndex(([source]) => source === id);
        return position(a) - position(b);
    });
}
export const onlineLyricsService = {
    saveIfMissing: (id: number, path: string, lyrics: string) => invoke<boolean>('save_online_lyrics_if_missing', { id, path, lyrics }),
    search: (keyword: string, provider: string) => invoke<{ candidates: OnlineLyricsCandidate[]; errors: string[] }>('search_online_lyrics', { keyword, provider }),
    fetch: (candidate: OnlineLyricsCandidate) => invoke<OnlineLyricsPayload>('fetch_online_lyrics', { candidate }),
};
