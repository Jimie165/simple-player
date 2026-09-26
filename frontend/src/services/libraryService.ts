import { invoke } from '@tauri-apps/api/core';
import type { SongMetadata, LibraryFolder, Playlist } from '@/types';
import type { VideoMetadata } from '@/types/video';
import { sortSongs } from '@/utils/songSort';
import type { SortKey, SortOrder } from '@/utils/songSort';

export interface UpdateSongDetailsRequest {
    id: number;
    title: string;
    artist: string;
    album: string;
    album_artist?: string | null;
    year?: number | null;
    genre?: string | null;
    track_number?: number | null;
    track_total?: number | null;
    disc_number?: number | null;
    disc_total?: number | null;
    lyrics_text?: string | null;
    lyrics_source_path?: string | null;
    lyrics_offset_ms: number;
    artwork_source_path?: string | null;
    remove_artwork?: boolean;
    metadata_overridden: boolean;
}

export interface AlbumFieldUpdate<T> {
    value: T | null;
}

export interface UpdateAlbumSongDetails {
    id: number;
    album?: AlbumFieldUpdate<string>;
    artist?: AlbumFieldUpdate<string>;
    album_artist?: AlbumFieldUpdate<string>;
    genre?: AlbumFieldUpdate<string>;
    year?: AlbumFieldUpdate<number>;
    track_number?: AlbumFieldUpdate<number>;
    track_total?: AlbumFieldUpdate<number>;
    disc_number?: AlbumFieldUpdate<number>;
    disc_total?: AlbumFieldUpdate<number>;
    metadata_overridden: boolean;
}

export interface UpdateAlbumDetailsRequest {
    ids: number[];
    updates: UpdateAlbumSongDetails[];
    artwork_source_path?: string | null;
    remove_artwork?: boolean;
}

export interface AddLibraryFolderResult {
    songs: SongMetadata[];
    existing_folder: boolean;
    excluded_songs: SongMetadata[];
}

export interface RestoreExcludedSongsResult {
    songs: SongMetadata[];
    restored_count: number;
    missing_count: number;
}

export interface AddVideoFolderResult {
    videos: VideoMetadata[];
    existing_folder: boolean;
    archived_videos: VideoMetadata[];
}

export interface RestoreArchivedVideosResult {
    videos: VideoMetadata[];
    restored_count: number;
    missing_count: number;
}

export const libraryService = {
    // ========== 文件夹管理 ==========
    getFolders: async (): Promise<LibraryFolder[]> => {
        return invoke('get_library_folders');
    },

    getVideoFolders: async (): Promise<LibraryFolder[]> => {
        return invoke('get_video_folders');
    },

    addFolder: async (folder: string): Promise<AddLibraryFolderResult> => {
        return invoke('add_library_folder', { folder });
    },

    addVideoFolder: async (folder: string): Promise<AddVideoFolderResult> => {
        return invoke('add_video_folder', { folder });
    },

    restoreArchivedVideos: async (ids: number[]): Promise<RestoreArchivedVideosResult> => {
        return invoke('restore_archived_videos', { ids });
    },

    removeFolder: async (folder: string): Promise<LibraryFolder[]> => {
        return invoke('remove_library_folder', { folder });
    },

    removeVideoFolder: async (folder: string): Promise<LibraryFolder[]> => {
        return invoke('remove_video_folder', { folder });
    },

    // ========== 库扫描 ==========
    scanLibrary: async (forceRestore: boolean = false): Promise<SongMetadata[]> => {
        return invoke('scan_library', { forceRestore });
    },

    refreshLibrary: async (): Promise<SongMetadata[]> => {
        return invoke('refresh_library');
    },

    getIgnoredDirNames: async (): Promise<string[]> => {
        return invoke('get_ignored_dir_names');
    },

    setIgnoredDirNames: async (names: string[]): Promise<string[]> => {
        return invoke('set_ignored_dir_names', { names });
    },

    getScopedIgnoredDirNames: async (): Promise<ScopedIgnoredDirNames> => {
        return invoke('get_scoped_ignored_dir_names');
    },

    setScopedIgnoredDirNames: async (names: ScopedIgnoredDirNames): Promise<ScopedIgnoredDirNames> => {
        return invoke('set_scoped_ignored_dir_names', { names });
    },

    refreshVideoLibrary: async (): Promise<VideoMetadata[]> => {
        return invoke('scan_videos');
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
    searchVideos: async (query: string): Promise<VideoMetadata[]> => {
        return invoke('search_videos', { query });
    },

    // ========== 单曲操作 ==========
    deleteSong: async (id: number): Promise<void> => {
        return invoke('delete_song', { id });
    },

    restoreSong: async (id: number): Promise<void> => {
        return invoke('restore_song', { id });
    },

    restoreExcludedSongs: async (ids: number[]): Promise<RestoreExcludedSongsResult> => {
        return invoke('restore_excluded_songs', { ids });
    },

    updateSongDetails: async (request: UpdateSongDetailsRequest): Promise<SongMetadata> => {
        return invoke('update_song_details', { request });
    },

    updateAlbumDetails: async (request: UpdateAlbumDetailsRequest): Promise<SongMetadata[]> => {
        return invoke('update_album_details', { request });
    },

    // ========== 批量操作 ==========
    batchDeleteSongs: async (ids: number[]): Promise<void> => {
        return invoke('batch_delete_songs', { ids });
    },

    batchDeleteVideos: async (ids: number[]): Promise<void> => {
        return invoke('batch_delete_videos', { ids });
    },

    // ========== 收藏功能 ==========
    toggleFavorite: async (songId: number): Promise<boolean> => {
        return invoke('toggle_favorite', { songId });
    },

    batchToggleFavorite: async (ids: number[], isFavorite: boolean): Promise<void> => {
        return invoke('batch_toggle_favorite', { ids, isFavorite });
    },

    getFavorites: async (sortOrder?: 'asc' | 'desc'): Promise<SongMetadata[]> => {
        return invoke('get_favorites', { sortOrder });
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

    batchRemoveFromPlaylist: async (playlistId: number, songIds: number[]): Promise<void> => {
        return invoke('batch_remove_from_playlist', { playlistId, songIds });
    },

    batchRemovePlaylistItems: async (playlistId: number, uniqueIds: number[]): Promise<void> => {
        return invoke('batch_remove_playlist_items', { playlistId, uniqueIds });
    },

    reorderPlaylistSongs: async (playlistId: number, songIds: number[]): Promise<void> => {
        return invoke('reorder_playlist_songs', { playlistId, songIds });
    },

    updatePlaylistInfo: async (id: number, name: string, description?: string): Promise<void> => {
        return invoke('update_playlist_info', { id, name, description });
    },

    updatePlaylistCover: async (id: number, coverPath: string): Promise<void> => {
        return invoke('update_playlist_cover', { id, coverPath });
    },

    getPlaylistSongs: async (playlistId: number): Promise<SongMetadata[]> => {
        return invoke('get_playlist_songs', { playlistId });
    },

    getPlaylistCoverPaths: async (playlistId: number, settings: { sortKey: SortKey; sortOrder: SortOrder }): Promise<string[]> => {
        if (settings.sortKey === 'manual' && settings.sortOrder === 'asc') {
            return invoke('get_playlist_cover_paths', { playlistId });
        }
        const songs = await libraryService.getPlaylistSongs(playlistId);
        const orderedCoverPaths = sortSongs(songs, settings.sortKey, settings.sortOrder)
            .map(song => song.cover_path)
            .filter((path): path is string => !!path);
        return invoke('get_playlist_cover_paths', { playlistId, orderedCoverPaths });
    },
    markPlaylistAsPlayed: async (playlistId: number): Promise<void> => {
        return invoke('mark_playlist_as_played', { playlistId });
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

    getAllVideos: async (): Promise<VideoMetadata[]> => {
        return invoke('get_all_videos');
    },
};

export interface ScopedIgnoredDirNames {
    common: string[];
    music: string[];
    video: string[];
}
