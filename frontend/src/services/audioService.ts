import { invoke } from '@tauri-apps/api/core';
import { appDataDir, appCacheDir } from '@tauri-apps/api/path';
import type { SongMetadata } from '@/types';

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
};