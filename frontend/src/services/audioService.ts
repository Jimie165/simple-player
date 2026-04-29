import { invoke } from '@tauri-apps/api/core';
import { appDataDir, appCacheDir } from '@tauri-apps/api/path';
import type { LyricsData, LyricsLine, SongMetadata } from '@/types';

// fallback for raw lrc
function tryParseLrc(data: LyricsData): LyricsData {
    if (data.has_timestamps) return data;

    let hasTimestamps = false;
    const parsedLines: LyricsLine[] = [];
    const timeRegExp = /\[(\d{2,}):(\d{2})(?:[\.:](\d{2,3}))?\]/g;

    for (const lineObj of data.lines) {
        const text = lineObj.text;
        const matches = [...text.matchAll(timeRegExp)];

        if (matches.length > 0) {
            hasTimestamps = true;
            const cleanText = text.replace(timeRegExp, '').trim();

            for (const m of matches) {
                const minutes = parseInt(m[1], 10);
                const seconds = parseInt(m[2], 10);
                const fractionStr = m[3] || '0';
                // Handle different lengths of fraction part
                const fractionMs = parseInt(fractionStr.padEnd(3, '0').slice(0, 3), 10);
                const timeMs = minutes * 60000 + seconds * 1000 + fractionMs;

                parsedLines.push({ time_ms: timeMs, text: cleanText });
            }
        } else {
            parsedLines.push({ time_ms: null, text: text.trim() });
        }
    }

    if (!hasTimestamps) return data;

    parsedLines.sort((a, b) => {
        if (a.time_ms === null && b.time_ms === null) return 0;
        if (a.time_ms === null) return -1;
        if (b.time_ms === null) return 1;
        return (a.time_ms as number) - (b.time_ms as number);
    });

    return {
        lines: parsedLines,
        has_timestamps: true
    };
}

let cachedAppDataDir: string | null = null;
let cachedAppCacheDir: string | null = null;

async function getAppDataDir(): Promise<string> {
    if (cachedAppDataDir) return cachedAppDataDir;
    cachedAppDataDir = await appDataDir();
    return cachedAppDataDir;
}

async function getAppCacheDir(): Promise<string> {
    if (cachedAppCacheDir) return cachedAppCacheDir;
    cachedAppCacheDir = await appCacheDir();
    return cachedAppCacheDir;
}

export const audioService = {
    // 播放音频 (带元数据用于更新 SMTC)
    play: async (path: string, metadata?: SongMetadata) => {
        // 解析 cover_path 为绝对路径，以便后端 SMTC 可以读取
        let resolvedMetadata = metadata;
        if (metadata?.cover_path) {
            // Check if path is absolute or URL
            const isUrl = metadata.cover_path.includes('://');
            // Basic check for Windows drive letter (e.g. C:) or Unix root (/)
            const isAbsolutePath = metadata.cover_path.includes(':') || metadata.cover_path.startsWith('/');

            // Determine if we are on Windows
            const isWindows = navigator.userAgent.toLowerCase().includes('windows');

            if (!isUrl && !isAbsolutePath) {
                // It's a relative path (e.g. cache/covers/...)
                // Use cache directory for cache/ paths, otherwise use appData
                let baseDir: string;
                if (metadata.cover_path.startsWith('cache/')) {
                    baseDir = await getAppCacheDir();
                } else {
                    baseDir = await getAppDataDir();
                }

                if (isWindows) {
                    // Windows: Use backslashes
                    const normalizedDir = baseDir.replace(/\//g, '\\').replace(/\\$/, '');
                    const normalizedPath = metadata.cover_path.replace(/\//g, '\\').replace(/^\\/, '');
                    const fullCoverPath = `${normalizedDir}\\${normalizedPath}`;
                    resolvedMetadata = { ...metadata, cover_path: fullCoverPath };
                } else {
                    // Unix: Use forward slashes
                    const normalizedDir = baseDir.replace(/\\/g, '/').replace(/\/$/, '');
                    const normalizedPath = metadata.cover_path.replace(/\\/g, '/').replace(/^\//, '');
                    const fullCoverPath = `${normalizedDir}/${normalizedPath}`;
                    resolvedMetadata = { ...metadata, cover_path: fullCoverPath };
                }
            } else if (isAbsolutePath && isWindows) {
                // Ensure absolute paths on Windows use backslashes
                const fixedPath = metadata.cover_path.replace(/\//g, '\\');
                resolvedMetadata = { ...metadata, cover_path: fixedPath };
            }
        }
        return invoke('play_audio', { path, metadata: resolvedMetadata });
    },

    pause: async () => invoke('pause_audio'),

    resume: async () => invoke('resume_audio'),

    // 跳转进度 (秒)
    seek: async (position: number) => invoke('seek_audio', { position }),

    // 设置音量 (0.0 - 1.0)
    setVolume: async (volume: number) => invoke('set_volume', { volume }),

    // 获取当前播放进度 (秒)
    getCurrentTime: async (): Promise<number> => invoke('get_audio_position'),

    // 获取歌词 (嵌入歌词)
    getLyrics: async (path: string): Promise<LyricsData> => {
        const data: LyricsData = await invoke('get_lyrics', { path });
        return tryParseLrc(data);
    },
};