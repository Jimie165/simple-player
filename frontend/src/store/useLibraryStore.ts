import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RecentItem, SongMetadata } from '@/types/index';
import type { VideoMetadata } from '@/types/video';
import { formatTime } from '@/utils/time';
import {
    addMultipleToNextFn,
    clearUserQueueFn,
    getNextIndexFn,
    removeQueueItemFn,
    removeSongFromPlaylistByIndexFn,
    removeSongFromPlaylistFn,
    reorderPlaylistFn,
    toggleShuffleListFn,
} from '@/store/actions/queueActions';
import { isFavoriteFn, refreshFavoritesFn, toggleFavoriteFn } from '@/store/actions/favoriteActions';

type SortKey = 'manual' | 'title' | 'artist' | 'album' | 'duration';
type SortOrder = 'asc' | 'desc';

interface PlaylistSettings {
    sortKey: SortKey;
    sortOrder: SortOrder;
}

interface LibraryState {
    recentHistory: RecentItem[];
    playHistory: number[];
    playlistSettings: Record<string, PlaylistSettings>;
    playlist: SongMetadata[];
    originalPlaylist: SongMetadata[];
    currentSongIndex: number;
    favoriteSet: Set<number>;
    favoritesLoaded: boolean;
    pathMap: Map<string, number>; // Cache for path -> id
    optimisticallyDeletedSongIds: Set<number>;
    markSongsAsOptimisticallyDeleted: (ids: number[]) => void;
    clearOptimisticallyDeletedSongs: (ids?: number[]) => void;
    refreshFavorites: () => Promise<void>;
    refreshRecentHistory: () => Promise<void>;
    isFavorite: (song: SongMetadata | { id?: number | string, path?: string }) => boolean;

    addToRecent: (item: RecentItem) => void;
    removeFromRecent: (id: string) => void;
    updateRecentItemCover: (id: string, newCoverPath: string | null) => void;
    setPlaylist: (songs: SongMetadata[]) => void;
    setCurrentSongIndex: (index: number) => void;
    pushHistory: (index: number) => void;
    popHistory: () => number | undefined;
    clearPlayHistory: () => void;

    // 修改：参数变了，不再需要 mode 参数，因为状态在 store 里
    // 或者为了解耦，我们依然接收参数，或者在组件层处理
    // 为了方便，我们在 store 内部实现 shuffle 逻辑
    toggleShuffleList: (enable: boolean) => void;

    // 修改：getNextIndex 需要根据 repeatMode 判断是否停止
    getNextIndex: (repeatMode: 'off' | 'all' | 'one') => number;

    // 新增：从播放列表中移除特定歌曲（用于同步库删除操作）
    removeSongFromPlaylist: (path: string) => void;
    // 新增：按索引从显示队列移除（支持重复歌曲的精确删除）
    removeSongFromPlaylistByIndex: (index: number) => void;

    // 新增：拖拽排序
    reorderPlaylist: (fromIndex: number, toIndex: number) => void;

    // Add to Queue (Add to end of playlist)
    addToPlaylist: (song: SongMetadata) => void;
    // Add to Next (Insert after current song)
    addToNext: (song: SongMetadata, asQueueItem?: boolean) => void;
    // Add multiple to next (helper)
    addMultipleToNext: (songs: SongMetadata[], asQueueItem?: boolean) => void;

    // 清空用户手动添加的队列
    clearUserQueue: () => void;
    // 移除单个队列项
    removeQueueItem: (index: number) => void;
    // 记录播放列表添加时间
    recordPlaylistAddition: (playlistId: number) => void;
    lastAddedToPlaylists: Record<number, number>;

    // Library Version for Sync
    libraryVersion: number;
    triggerLibraryUpdate: () => void;

    // Playlist Version for Sync (Add/Remove songs)
    playlistVersion: number;
    triggerPlaylistUpdate: () => void;

    // Favorites
    toggleFavorite: (song: SongMetadata) => Promise<void>;

    setPlaylistSettings: (id: string, settings: PlaylistSettings) => void;
    getPlaylistSettings: (id: string) => PlaylistSettings;

    // Queue Context
    queueContext: { type: string, name: string, id?: string } | null;
    setQueueContext: (context: { type: string, name: string, id?: string } | null) => void;
}

import { libraryService } from '@/services/libraryService';

const MAX_RECENT_ITEMS = 50;

const sanitizeRecentItem = (item: RecentItem): RecentItem => ({
    ...item,
    cover: null
});

const safeStorage = createJSONStorage(() => ({
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
        try {
            localStorage.setItem(name, value);
        } catch (error) {
            // Attempt to shrink payload on quota error
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                try {
                    const parsed = JSON.parse(value);
                    if (parsed?.state?.recentHistory?.length) {
                        parsed.state.recentHistory = parsed.state.recentHistory
                            .map((item: RecentItem) => sanitizeRecentItem(item))
                            .slice(0, 20);
                    }
                    localStorage.setItem(name, JSON.stringify(parsed));
                } catch (innerError) {
                    console.error('Failed to shrink library-store payload', innerError);
                }
            } else {
                console.error('Failed to persist library-store', error);
            }
        }
    },
    removeItem: (name) => localStorage.removeItem(name)
}));

export const useLibraryStore = create<LibraryState>()(persist((set, get) => ({
    recentHistory: [],
    playlistSettings: {},
    playHistory: [],
    playlist: [],
    originalPlaylist: [],
    currentSongIndex: -1,
    queueContext: null,
    lastAddedToPlaylists: {},

    setQueueContext: (context) => set({ queueContext: context }),

    // Cache for favorites (Set of IDs)
    favoriteSet: new Set<number>(),
    favoritesLoaded: false,
    pathMap: new Map<string, number>(),
    optimisticallyDeletedSongIds: new Set<number>(),

    markSongsAsOptimisticallyDeleted: (ids) => set((state) => {
        if (ids.length === 0) return {};
        const next = new Set(state.optimisticallyDeletedSongIds);
        ids.forEach((id) => next.add(id));
        return { optimisticallyDeletedSongIds: next };
    }),

    clearOptimisticallyDeletedSongs: (ids) => set((state) => {
        if (!ids || ids.length === 0) {
            if (state.optimisticallyDeletedSongIds.size === 0) return {};
            return { optimisticallyDeletedSongIds: new Set<number>() };
        }
        const next = new Set(state.optimisticallyDeletedSongIds);
        ids.forEach((id) => next.delete(id));
        return { optimisticallyDeletedSongIds: next };
    }),

    isFavorite: (song) => {
        const { favoriteSet, pathMap } = get();
        return isFavoriteFn(favoriteSet, pathMap, song);
    },

    refreshFavorites: async () => {
        try {
            const { favoriteSet, pathMap } = await refreshFavoritesFn(get().pathMap);
            set({ favoriteSet, pathMap, favoritesLoaded: true });
        } catch (e) { console.error('Failed to refresh favorites', e); }
    },

    refreshRecentHistory: async () => {
        try {
            const { recentHistory } = get();
            if (recentHistory.length === 0) return;

            const hasPlaylistItems = recentHistory.some((item) => item.type === 'playlist');

            // Fetch latest data safely
            const [allSongs, allVideos, playlists] = await Promise.all([
                libraryService.getLibrarySongs().catch(() => [] as SongMetadata[]),
                libraryService.getAllVideos().catch(() => [] as VideoMetadata[]),
                hasPlaylistItems ? libraryService.getPlaylists().catch(() => []) : Promise.resolve([])
            ]);

            // Create lookup maps for faster access
            const songMap = new Map<string, SongMetadata>();
            allSongs.forEach((s: SongMetadata) => {
                if (s.path) songMap.set(s.path.replace(/[\\/]/g, '/').toLowerCase(), s);
            });

            const videoMap = new Map<string, VideoMetadata>();
            allVideos.forEach((v: VideoMetadata) => {
                if (v.path) videoMap.set(v.path.replace(/[\\/]/g, '/').toLowerCase(), v);
            });

            const playlistIds = new Set(
                (playlists as Array<{ id: number }>).map((playlist) => playlist.id)
            );

            const newRecent = recentHistory.map(item => {
                if (item.type === 'file' || item.type === 'video') {
                    const normPath = item.path.replace(/[\\/]/g, '/').toLowerCase();

                    // Try finding in videos
                    if (item.type === 'video') {
                        const found = videoMap.get(normPath);
                        if (found) {
                            return {
                                ...item,
                                title: found.title || item.title,
                                description: found.duration ? formatTime(found.duration) : item.description,
                                cover_path: found.thumbnail_path || item.cover_path,
                            } as RecentItem;
                        }
                    }

                    // Try finding in songs
                    if (item.type === 'file' || (item.type !== 'video' && !videoMap.has(normPath))) {
                        const found = songMap.get(normPath);
                        if (found) {
                            return {
                                ...item,
                                title: found.title || item.title,
                                artist: found.artist || item.artist,
                                album: found.album || item.album,
                                cover_path: found.cover_path || item.cover_path,
                                description: found.artist || item.description,
                                isLibraryItem: true
                            } as RecentItem;
                        }
                    }
                }
                return item;
            }).filter((item) => {
                if (item.type === 'playlist') {
                    if (item.id === 'playlist:favorites') return true;
                    const rawId = item.id.replace('playlist:', '');
                    const playlistId = Number.parseInt(rawId, 10);
                    return Number.isInteger(playlistId) && playlistIds.has(playlistId);
                }

                if (item.type === 'video') {
                    const normPath = item.path.replace(/[\\/]/g, '/').toLowerCase();
                    return videoMap.has(normPath);
                }

                if (item.type === 'file' && item.isLibraryItem) {
                    const normPath = item.path.replace(/[\\/]/g, '/').toLowerCase();
                    return songMap.has(normPath) || videoMap.has(normPath);
                }

                return true;
            });

            set({ recentHistory: newRecent });
        } catch (e) {
            console.error('Failed to refresh recent history', e);
        }
    },

    addToRecent: (item) => set((state) => {
        if (item.type === 'artist') return state;
        const safeItem = sanitizeRecentItem(item);
        // 使用 id 去重而不是 path，因为专辑的 id 是 album:name:artist 格式
        const filtered = state.recentHistory.filter(i => i.id !== safeItem.id);
        return { recentHistory: [safeItem, ...filtered].slice(0, MAX_RECENT_ITEMS) };
    }),

    removeFromRecent: (id) => set((state) => ({
        recentHistory: state.recentHistory.filter(i => i.id !== id)
    })),

    updateRecentItemCover: (id, newCoverPath) => set((state) => ({
        recentHistory: state.recentHistory.map(i =>
            i.id === id ? { ...i, cover_path: newCoverPath } : i
        )
    })),

    setPlaylist: (songs) => set({
        playlist: songs,
        originalPlaylist: songs,
        playHistory: []
    }),

    setCurrentSongIndex: (currentSongIndex) => set({ currentSongIndex }),

    pushHistory: (index) => set((state) => ({ playHistory: [...state.playHistory, index] })),

    clearPlayHistory: () => set({ playHistory: [] }),

    popHistory: () => {
        const { playHistory } = get();
        if (playHistory.length === 0) return undefined;
        const newHistory = [...playHistory];
        const prevIndex = newHistory.pop();
        set({ playHistory: newHistory });
        return prevIndex;
    },

    toggleShuffleList: (enable) => {
        const next = toggleShuffleListFn(get(), enable);
        if (next) set(next);
    },

    // --- 修改：获取下一首逻辑 ---
    getNextIndex: (repeatMode) => getNextIndexFn(get(), repeatMode),

    removeSongFromPlaylist: (path: string) => {
        const next = removeSongFromPlaylistFn(get(), path);
        if (next) set(next);
    },

    removeSongFromPlaylistByIndex: (index) => {
        const next = removeSongFromPlaylistByIndexFn(get(), index);
        if (next) set(next);
    },

    reorderPlaylist: (fromIndex, toIndex) => set((state) => {
        const next = reorderPlaylistFn(state, fromIndex, toIndex);
        return next ?? state;
    }),

    addToPlaylist: (song) => set((state) => ({
        playlist: [...state.playlist, song],
        originalPlaylist: [...state.originalPlaylist, song]
    })),

    addToNext: (song, asQueueItem = false) => get().addMultipleToNext([song], asQueueItem),

    addMultipleToNext: (songs, asQueueItem = false) => set((state) => addMultipleToNextFn(state, songs, asQueueItem)),

    clearUserQueue: () => set((state) => clearUserQueueFn(state)),

    removeQueueItem: (index: number) => set((state) => removeQueueItemFn(state, index) ?? {}),

    recordPlaylistAddition: (playlistId) => set((state) => ({
        lastAddedToPlaylists: {
            ...state.lastAddedToPlaylists,
            [playlistId]: Date.now()
        }
    })),

    libraryVersion: 0,
    triggerLibraryUpdate: () => set((state) => ({ libraryVersion: state.libraryVersion + 1 })),

    playlistVersion: 0,
    triggerPlaylistUpdate: () => set((state) => ({ playlistVersion: state.playlistVersion + 1 })),

    toggleFavorite: async (song) => {
        try {
            await toggleFavoriteFn(song, get, set);
        } catch (error) {
            console.error('Failed to toggle favorite', error);
        }
    },

    setPlaylistSettings: (id, settings) => {
        set((state) => ({
            playlistSettings: {
                ...state.playlistSettings,
                [id]: settings
            }
        }));
        get().triggerLibraryUpdate();
    },

    getPlaylistSettings: (id) => {
        const { playlistSettings } = get();
        // Default for Favorites should be 'manual' to respect added order (if backend supports it) or at least not random title sort
        if (id === 'favorites' && !playlistSettings[id]) {
            return { sortKey: 'manual', sortOrder: 'asc' };
        }
        return playlistSettings[id] || { sortKey: 'manual', sortOrder: 'asc' };
    }
}), {
    name: 'library-store',
    storage: safeStorage,
    partialize: (state) => ({
        recentHistory: state.recentHistory,
        playlistSettings: state.playlistSettings,
        queueContext: state.queueContext,
        // Persist Session
        currentSongIndex: state.currentSongIndex,
        playlist: state.playlist,
        originalPlaylist: state.originalPlaylist,
        lastAddedToPlaylists: state.lastAddedToPlaylists
    }),
}));
