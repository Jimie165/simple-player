import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { VideoMetadata } from '@/types/video';
import { invoke } from '@tauri-apps/api/core';

interface VideoState {
    videos: VideoMetadata[];
    refreshing: boolean;
    viewMode: 'grid' | 'list'; // For future use

    // Actions
    fetchVideos: () => Promise<void>;
    scanVideos: () => Promise<void>;
    toggleFavorite: (id: number) => Promise<void>;
    batchDelete: (ids: number[]) => Promise<void>;
}


export const useVideoStore = create<VideoState>()(persist((set) => ({
    videos: [],
    refreshing: false,
    viewMode: 'grid',


    fetchVideos: async () => {
        try {
            const videos = await invoke<VideoMetadata[]>('get_all_videos');
            set({ videos });
        } catch (error) {
            console.error('Failed to fetch videos', error);
        }
    },

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


}), {
    name: 'video-store',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
        videos: state.videos,
        viewMode: state.viewMode,

    })
}));
