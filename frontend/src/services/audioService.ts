import { invoke } from '@tauri-apps/api/core';
import type { SongMetadata } from '../types';

export const audioService = {
    // 播放音频 (带元数据用于更新 SMTC)
    play: async (path: string, metadata?: SongMetadata) => {
        return invoke('play_audio', { path, metadata });
    },

    pause: async () => invoke('pause_audio'),

    resume: async () => invoke('resume_audio'),

    // 跳转进度 (秒)
    seek: async (position: number) => invoke('seek_audio', { position }),

    // 设置音量 (0.0 - 1.0)
    setVolume: async (volume: number) => invoke('set_volume', { volume }),
};