import { invoke } from '@tauri-apps/api/core';
import type { SongMetadata } from '../types';

export const fileService = {
    // 获取单个文件的元数据
    getMetadata: async (path: string): Promise<SongMetadata> => {
        return invoke<SongMetadata>('get_metadata', { path });
    },

    // 扫描文件夹内的音频文件
    readFolder: async (folder: string): Promise<string[]> => {
        return invoke<string[]>('read_folder_audio', { folder });
    },
};