import { invoke } from '@tauri-apps/api/core';

export const videoService = {
    fileExists: (path: string): Promise<boolean> => invoke('video_file_exists', { path }),
};
