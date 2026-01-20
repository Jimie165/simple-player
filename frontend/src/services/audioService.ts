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
                const dataDir = await getAppDataDir();
                // 使用简单字符串拼接，确保路径分隔符正确
                const normalizedDir = dataDir.replace(/\\/g, '/').replace(/\/$/, '');
                const normalizedPath = metadata.cover_path.replace(/\\/g, '/').replace(/^\//, '');
                const fullCoverPath = `${normalizedDir}/${normalizedPath}`;
                resolvedMetadata = { ...metadata, cover_path: fullCoverPath };
            } catch (e) {
                console.error('Failed to resolve cover path:', e);
                // 继续使用原始 metadata，不要阻止播放
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
};