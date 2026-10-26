import { invoke } from '@tauri-apps/api/core';

export const videoService = {
    fileExists: (path: string): Promise<boolean> => invoke('video_file_exists', { path }),
    recordPlayback: (path: string): Promise<string | null> => invoke('record_video_playback', { path }),
};
