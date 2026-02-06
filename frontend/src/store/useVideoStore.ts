import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { VideoMetadata } from '@/types/video';
import type { LibraryFolder } from '@/types';
import { libraryService } from '@/services/libraryService';
import { invoke } from '@tauri-apps/api/core';

interface VideoState {
    videos: VideoMetadata[];
    refreshing: boolean;
    viewMode: 'grid' | 'list'; // For future use
    videoFolders: LibraryFolder[];
    foldersRefreshing: boolean;
    collapsedFolderIds: number[];
    sortBy: 'name' | 'created' | 'played';
    sortOrder: 'asc' | 'desc';

    // Actions
    fetchVideos: () => Promise<void>;
    setVideos: (videos: VideoMetadata[]) => void;
    fetchVideoFolders: () => Promise<void>;
    scanVideos: () => Promise<void>;
    toggleFolderCollapse: (id: number) => void;
    setSortBy: (sortBy: 'name' | 'created' | 'played') => void;
    setSortOrder: (sortOrder: 'asc' | 'desc') => void;
    toggleFavorite: (id: number) => Promise<void>;
    batchDelete: (ids: number[]) => Promise<void>;
    updateThumbnail: (id: number, thumbnail_path: string) => void;
}


export const useVideoStore = create<VideoState>()(persist((set) => ({
    videos: [],
    refreshing: false,
    viewMode: 'grid',
    videoFolders: [],
    foldersRefreshing: false,
    collapsedFolderIds: [],
    sortBy: 'created',
    sortOrder: 'desc',


    fetchVideos: async () => {
        try {
            const videos = await invoke<VideoMetadata[]>('get_all_videos');
            set({ videos });
        } catch (error) {
            console.error('Failed to fetch videos', error);
        }
    },
    setVideos: (videos) => {
        set({ videos });
    },
    fetchVideoFolders: async () => {
        set({ foldersRefreshing: true });
        try {
            const folders = await libraryService.getVideoFolders();
            set({ videoFolders: folders });
        } catch (error) {
            console.error('Failed to fetch video folders', error);
        } finally {
            set({ foldersRefreshing: false });
        }
    },

    toggleFolderCollapse: (id: number) => {
        set((state) => {
            const current = state.collapsedFolderIds;
            const isCollapsed = current.includes(id);
            return {
                collapsedFolderIds: isCollapsed
                    ? current.filter(fid => fid !== id)
                    : [...current, id]
            };
        });
    },

    setSortBy: (sortBy) => set({ sortBy }),
    setSortOrder: (sortOrder) => set({ sortOrder }),

    scanVideos: async () => {
        set({ refreshing: true });
        try {
            const videos = await invoke<VideoMetadata[]>('scan_videos');
            set({ videos });
        } catch (error) {
            console.error('Failed to scan videos', error);
        } finally {
            set({ refreshing: false });
        }
    },

    toggleFavorite: async (id: number) => {
        try {
            const newStatus = await invoke<boolean>('toggle_video_favorite', { videoId: id });
            set((state) => ({
                videos: state.videos.map(v =>
                    v.id === id ? { ...v, is_favorite: newStatus } : v
                )
            }));
        } catch (error) {
            console.error('Failed to toggle video favorite', error);
        }
    },

    batchDelete: async (ids: number[]) => {
        try {
            await invoke('batch_delete_videos', { ids });
            set((state) => ({
                videos: state.videos.filter(v => !ids.includes(v.id))
            }));
        } catch (error) {
            console.error('Failed to batch delete videos', error);
        }
    },
    updateThumbnail: (id, thumbnail_path) => {
        set((state) => ({
            videos: state.videos.map(v =>
                v.id === id ? { ...v, thumbnail_path } : v
            )
        }));
    },


}), {
    name: 'video-store',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
        videos: state.videos,
        viewMode: state.viewMode,
        videoFolders: state.videoFolders,
        collapsedFolderIds: state.collapsedFolderIds,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
    })
}));
