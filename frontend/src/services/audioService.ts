import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import type { SongMetadata } from '../types';

let cachedAppDataDir: string | null = null;

async function getAppDataDir(): Promise<string> {
    if (cachedAppDataDir) return cachedAppDataDir;
    cachedAppDataDir = await appDataDir();
    return cachedAppDataDir;
}

export const audioService = {
    // 播放音频 (带元数据用于更新 SMTC)
    play: async (path: string, metadata?: SongMetadata) => {
        // 解析 cover_path 为绝对路径，以便后端 SMTC 可以读取
        let resolvedMetadata = metadata;
        if (metadata?.cover_path) {
            try {
                // 如果是绝对路径（包含 : 或以 / 开头），直接使用
                // 否则假设是相对于 AppData 的路径
                const isAbsolute = metadata.cover_path.includes(':') || metadata.cover_path.startsWith('/');
                if (!isAbsolute) {
                    const dataDir = await getAppDataDir();
                    const normalizedDir = dataDir.replace(/\\/g, '/').replace(/\/$/, '');
                    const normalizedPath = metadata.cover_path.replace(/\\/g, '/').replace(/^\//, '');
                    const fullCoverPath = `${normalizedDir}/${normalizedPath}`;
                    resolvedMetadata = { ...metadata, cover_path: fullCoverPath };
                }
            } catch (e) {
                console.error('Failed to resolve cover path:', e);
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