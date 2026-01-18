import { invoke } from '@tauri-apps/api/core';
import type { SongMetadata } from '../types';

export const libraryService = {
    getFolders: async (): Promise<string[]> => {
        return invoke('get_library_folders');
    },

    addFolder: async (folder: string): Promise<string[]> => {
        return invoke('add_library_folder', { folder });
    },

    removeFolder: async (folder: string): Promise<string[]> => {
        return invoke('remove_library_folder', { folder });
    },

    scanLibrary: async (): Promise<SongMetadata[]> => {
        return invoke('scan_library');
    }
};