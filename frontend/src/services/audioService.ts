import { invoke } from '@tauri-apps/api/core';
import { appDataDir, appCacheDir } from '@tauri-apps/api/path';
import type { BackendLyricsData, LyricsDocument, PlaybackSnapshot, SongMetadata } from '@/types';
import { parseLyrics } from '@/utils/lyrics/parseLyrics';

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
        return invoke<PlaybackSnapshot>('play_audio', { path, metadata: resolvedMetadata });
    },

    load: async (path: string, metadata?: SongMetadata) => {
        return invoke<PlaybackSnapshot>('load_audio', { path, metadata });
    },

    pause: async (): Promise<PlaybackSnapshot> => invoke('pause_audio'),

    resume: async (): Promise<PlaybackSnapshot> => invoke('resume_audio'),

    // 跳转进度 (秒)
    seek: async (position: number): Promise<number> => invoke('seek_audio', { position }),

    getPlaybackSnapshot: async (): Promise<PlaybackSnapshot> =>
        invoke('get_playback_snapshot'),

    // 设置音量 (0.0 - 1.0)
    setVolume: async (volume: number) => invoke('set_volume', { volume }),

    // 获取当前播放进度 (秒)
    getCurrentTime: async (): Promise<number> => invoke('get_audio_position'),

    // 获取歌词 (嵌入歌词)。后端已解析（SYLT）时 lines 为带时间戳行，
    // 未解析时 lines 为原始文本行，拼接回文本后由统一解析器做 LRC 检测。
    getLyrics: async (path: string): Promise<LyricsDocument> => {
        const data: BackendLyricsData = await invoke('get_lyrics', { path });
        if (!data.has_timestamps && data.lines.length > 0) {
            const rawText = data.lines.map(line => line.text).join('\n');
            return parseLyrics({ rawText, sourcePath: path, offsetMs: data.offset_ms });
        }
        return parseLyrics({ timedLines: data.lines, sourcePath: path, offsetMs: data.offset_ms });
    },

    getRawLyrics: async (path: string): Promise<string | null> => {
        return invoke<string | null>('get_raw_lyrics', { path });
    },

    listAudioOutputs: async (): Promise<AudioOutputInfo[]> =>
        invoke('list_audio_outputs'),

    getAudioOutput: async (): Promise<AudioOutputState> =>
        invoke('get_audio_output'),

    setAudioOutput: async (device: string | null): Promise<void> =>
        invoke('set_audio_output', { device }),

    setReactiveBackgroundEnabled: async (enabled: boolean): Promise<void> =>
        invoke('set_reactive_background_enabled', { enabled }),
};

export interface AudioOutputInfo {
    id: string;
    name: string;
    is_system_default: boolean;
    is_active: boolean;
}

export interface AudioOutputState {
    preference: string | null;
    active_device: string | null;
}
