import { invoke } from '@tauri-apps/api/core';
import type { SongMetadata, LibraryFolder, Playlist } from '../types';

export const libraryService = {
    // ========== 文件夹管理 ==========
    getFolders: async (): Promise<LibraryFolder[]> => {
        return invoke('get_library_folders');
    },

    addFolder: async (folder: string): Promise<SongMetadata[]> => {
        return invoke('add_library_folder', { folder });
    },

    removeFolder: async (folder: string): Promise<LibraryFolder[]> => {
        return invoke('remove_library_folder', { folder });
    },

    // ========== 库扫描 ==========
    scanLibrary: async (forceRestore: boolean = false): Promise<SongMetadata[]> => {
        return invoke('scan_library', { forceRestore });
    },

    refreshLibrary: async (): Promise<SongMetadata[]> => {
        return invoke('refresh_library');
    },

    getLibrarySongs: async (): Promise<SongMetadata[]> => {
        return invoke('get_library_songs');
    },

    getArchivedSongs: async (): Promise<SongMetadata[]> => {
        return invoke('get_archived_songs');
    },

    // ========== 搜索 ==========
    search: async (query: string): Promise<SongMetadata[]> => {
        return invoke('search_library', { query });
    },

    // ========== 单曲操作 ==========
    deleteSong: async (id: number): Promise<void> => {
        return invoke('delete_song', { id });
    },

    restoreSong: async (id: number): Promise<void> => {
        return invoke('restore_song', { id });
    },

    // ========== 批量操作 ==========
    batchDeleteSongs: async (ids: number[]): Promise<void> => {
        return invoke('batch_delete_songs', { ids });
    },

    // ========== 收藏功能 ==========
    toggleFavorite: async (songId: number): Promise<boolean> => {
        return invoke('toggle_favorite', { songId });
    },

    batchToggleFavorite: async (ids: number[], isFavorite: boolean): Promise<void> => {
        return invoke('batch_toggle_favorite', { ids, isFavorite });
    },

    getFavorites: async (): Promise<SongMetadata[]> => {
        return invoke('get_favorites');
    },

    // ========== 播放统计 ==========
    incrementPlayCount: async (songId: number): Promise<void> => {
        return invoke('increment_play_count', { songId });
    },

    // ========== 播放列表 ==========
    getPlaylists: async (): Promise<Playlist[]> => {
        return invoke('get_playlists');
    },

    createPlaylist: async (name: string): Promise<Playlist> => {
        return invoke('create_playlist', { name });
    },

    deletePlaylist: async (id: number): Promise<void> => {
        return invoke('delete_playlist', { id });
    },

    renamePlaylist: async (id: number, name: string): Promise<void> => {
        return invoke('rename_playlist', { id, name });
    },

    addToPlaylist: async (playlistId: number, songId: number): Promise<void> => {
        return invoke('add_to_playlist', { playlistId, songId });
    },

    batchAddToPlaylist: async (playlistId: number, songIds: number[]): Promise<void> => {
        return invoke('batch_add_to_playlist', { playlistId, songIds });
    },

    removeFromPlaylist: async (playlistId: number, songId: number): Promise<void> => {
        return invoke('remove_from_playlist', { playlistId, songId });
    },

    getPlaylistSongs: async (playlistId: number): Promise<SongMetadata[]> => {
        return invoke('get_playlist_songs', { playlistId });
    },

    // ========== 播放队列持久化 ==========
    savePlayQueue: async (songIds: number[]): Promise<void> => {
        return invoke('save_play_queue', { songIds });
    },

    getPlayQueue: async (): Promise<SongMetadata[]> => {
        return invoke('get_play_queue');
    },

    clearPlayQueue: async (): Promise<void> => {
        return invoke('clear_play_queue');
    },
};