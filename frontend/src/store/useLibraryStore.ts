import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RecentItem, SongMetadata } from '../types/index';

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
    pathMap: Map<string, number>; // Cache for path -> id
    refreshFavorites: () => Promise<void>;
    isFavorite: (song: SongMetadata | { id?: number | string, path?: string }) => boolean;

    addToRecent: (item: RecentItem) => void;
    removeFromRecent: (id: string) => void;
    setPlaylist: (songs: SongMetadata[]) => void;
    setCurrentSongIndex: (index: number) => void;
    pushHistory: (index: number) => void;
    popHistory: () => number | undefined;

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

    // Add to Queue (Add to end of playlist)
    addToPlaylist: (song: SongMetadata) => void;
    // Add to Next (Insert after current song)
    addToNext: (song: SongMetadata) => void;

    // Library Version for Sync
    libraryVersion: number;
    triggerLibraryUpdate: () => void;

    // Favorites
    toggleFavorite: (song: SongMetadata) => Promise<void>;

    setPlaylistSettings: (id: string, settings: PlaylistSettings) => void;
    getPlaylistSettings: (id: string) => PlaylistSettings;
}

import { libraryService } from '../services/libraryService';
import { usePlayerStore } from './usePlayerStore'; // Assuming we need to sync player metadata too

const MAX_RECENT_ITEMS = 50;

const sanitizeRecentItem = (item: RecentItem): RecentItem => {
    if (typeof item.cover === 'string' && item.cover.length > 1024) {
        return { ...item, cover: null };
    }
    return item;
};

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

    // Cache for favorites (Set of IDs)
    favoriteSet: new Set<number>(),
    pathMap: new Map<string, number>(),

    isFavorite: (song) => {
        const { favoriteSet, pathMap } = get();
        if (song.id && typeof song.id === 'number') return favoriteSet.has(song.id);
        if (song.path) {
            const normPath = song.path.replace(/[\\/]/g, '/').toLowerCase();
            const id = pathMap.get(normPath);
            if (id) return favoriteSet.has(id);
        }
        return false;
    },

    refreshFavorites: async () => {
        try {
            const favs = await libraryService.getFavorites();
            const ids = new Set(favs.map(s => s.id).filter((id): id is number => id !== undefined));

            // Rebuild path map if empty
            let currentPathMap = get().pathMap;
            if (currentPathMap.size === 0) {
                const all = await libraryService.getLibrarySongs();
                currentPathMap = new Map<string, number>();
                all.forEach(s => {
                    if (s.path && s.id) currentPathMap.set(s.path.replace(/[\\/]/g, '/').toLowerCase(), s.id);
                });
            }

            set({ favoriteSet: ids, pathMap: currentPathMap });
        } catch (e) { console.error('Failed to refresh favorites', e); }
    },

    addToRecent: (item) => set((state) => {
        const safeItem = sanitizeRecentItem(item);
        // 使用 id 去重而不是 path，因为专辑的 id 是 album:name:artist 格式
        const filtered = state.recentHistory.filter(i => i.id !== safeItem.id);
        return { recentHistory: [safeItem, ...filtered].slice(0, MAX_RECENT_ITEMS) };
    }),

    removeFromRecent: (id) => set((state) => ({
        recentHistory: state.recentHistory.filter(i => i.id !== id)
    })),

    setPlaylist: (songs) => set({
        playlist: songs,
        originalPlaylist: songs,
        playHistory: []
    }),

    setCurrentSongIndex: (currentSongIndex) => set({ currentSongIndex }),

    pushHistory: (index) => set((state) => ({ playHistory: [...state.playHistory, index] })),

    popHistory: () => {
        const { playHistory } = get();
        if (playHistory.length === 0) return undefined;
        const newHistory = [...playHistory];
        const prevIndex = newHistory.pop();
        set({ playHistory: newHistory });
        return prevIndex;
    },

    toggleShuffleList: (enable) => {
        const { originalPlaylist, playlist, currentSongIndex } = get();
        const currentSong = playlist[currentSongIndex];

        if (enable) {
            if (!originalPlaylist || originalPlaylist.length === 0) return;

            // Fisher-Yates 洗牌
            let shuffled = [...originalPlaylist];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            // 【核心修复】将当前歌曲移动到队列第一位
            if (currentSong) {
                const currentIdx = shuffled.findIndex(s => s.path === currentSong.path);
                if (currentIdx > 0) {
                    // 从原位置移除，插入到开头
                    shuffled.splice(currentIdx, 1);
                    shuffled.unshift(currentSong);
                }
            }

            // 当前歌曲现在是队列的第一首
            set({ playlist: shuffled, currentSongIndex: 0, playHistory: [] });
        } else {
            if (originalPlaylist.length === 0) return;
            let newIndex = 0;
            if (currentSong) {
                newIndex = originalPlaylist.findIndex(s => s.path === currentSong.path);
                if (newIndex === -1) newIndex = 0;
            }
            set({ playlist: originalPlaylist, currentSongIndex: newIndex, playHistory: [] });
        }
    },

    // --- 修改：获取下一首逻辑 ---
    getNextIndex: (repeatMode) => {
        const { playlist, currentSongIndex } = get();
        const len = playlist.length;
        if (len === 0) return -1;

        // 1. 单曲循环：永远返回当前 (注意：组件层点击"下一首"按钮时可能会特殊处理强制切歌，但自动播放时走这里)
        if (repeatMode === 'one') {
            return currentSongIndex;
        }

        // 2. 计算下一首的数值
        const nextIndex = currentSongIndex + 1;

        // 3. 判断是否越界
        if (nextIndex >= len) {
            // 到达末尾
            if (repeatMode === 'all') {
                return 0; // 列表循环：回到开头
            } else {
                return -1; // 不循环：停止播放
            }
        }

        return nextIndex; // 正常下一首
    },

    removeSongFromPlaylist: (path: string) => {
        const { playlist, currentSongIndex, originalPlaylist } = get();

        // 1. 从播放列表移除
        const newPlaylist = playlist.filter(s => s.path !== path);
        const newOriginalPlaylist = originalPlaylist.filter(s => s.path !== path);

        // 如果没变，说明不在列表里，直接返回
        if (newPlaylist.length === playlist.length) return;

        // 2. 修正当前索引
        let newIndex = currentSongIndex;
        const removingCurrent = playlist[currentSongIndex]?.path === path;

        if (removingCurrent) {
            if (newPlaylist.length === 0) {
                newIndex = -1;
            } else if (newIndex >= newPlaylist.length) {
                newIndex = newPlaylist.length - 1;
            }
        } else {
            const removedIndex = playlist.findIndex(s => s.path === path);
            if (removedIndex !== -1 && removedIndex < currentSongIndex) {
                newIndex = currentSongIndex - 1;
            }
        }

        set({
            playlist: newPlaylist,
            originalPlaylist: newOriginalPlaylist,
            currentSongIndex: newIndex,
            playHistory: []
        });
    },

    removeSongFromPlaylistByIndex: (index) => {
        const { playlist, currentSongIndex, originalPlaylist } = get();
        if (index < 0 || index >= playlist.length) return;

        const removedSong = playlist[index];
        const newPlaylist = [...playlist];
        newPlaylist.splice(index, 1);

        // 同步从 originalPlaylist 移除一首相同的歌 (尽量匹配移除)
        // 注意：如果 original 也有重复，我们只移除第一首找到的
        const newOriginalPlaylist = [...originalPlaylist];
        const originalIdx = newOriginalPlaylist.findIndex(s => s.path === removedSong.path);
        if (originalIdx !== -1) {
            newOriginalPlaylist.splice(originalIdx, 1);
        }

        // 修正当前索引
        let newIndex = currentSongIndex;
        if (index === currentSongIndex) {
            // 移除的是当前播放的
            if (newPlaylist.length === 0) {
                newIndex = -1;
            } else if (newIndex >= newPlaylist.length) {
                newIndex = newPlaylist.length - 1;
            }
        } else if (index < currentSongIndex) {
            // 移除的是当前之前的
            newIndex = currentSongIndex - 1;
        }

        set({
            playlist: newPlaylist,
            originalPlaylist: newOriginalPlaylist,
            currentSongIndex: newIndex,
            playHistory: []
        });
    },

    addToPlaylist: (song) => set((state) => ({
        playlist: [...state.playlist, song],
        originalPlaylist: [...state.originalPlaylist, song]
    })),

    addToNext: (song) => set((state) => {
        const { playlist, originalPlaylist, currentSongIndex } = state;
        if (playlist.length === 0) {
            return {
                playlist: [song],
                originalPlaylist: [song],
                currentSongIndex: 0
            };
        }

        const newPlaylist = [...playlist];
        newPlaylist.splice(currentSongIndex + 1, 0, song);

        const newOriginal = [...originalPlaylist];
        newOriginal.splice(currentSongIndex + 1, 0, song);

        return {
            playlist: newPlaylist,
            originalPlaylist: newOriginal
        };
    }),

    libraryVersion: 0,
    triggerLibraryUpdate: () => set((state) => ({ libraryVersion: state.libraryVersion + 1 })),

    toggleFavorite: async (song) => {
        let songId: number | undefined;
        const songPath = song.path;

        if (song.id && typeof song.id === 'number') {
            songId = song.id;
        } else if (songPath) {
            const normPath = songPath.replace(/[\\/]/g, '/').toLowerCase();
            songId = get().pathMap.get(normPath);

            if (!songId) {
                try {
                    const all = await libraryService.getLibrarySongs();
                    const found = all.find(s => {
                        if (!s.path) return false;
                        const p = s.path.replace(/[\\/]/g, '/').toLowerCase();
                        return p === normPath && typeof s.id === 'number';
                    });
                    if (found?.id && typeof found.id === 'number') {
                        songId = found.id;
                        set((state) => {
                            const newMap = new Map(state.pathMap);
                            newMap.set(normPath, found.id as number);
                            return { pathMap: newMap };
                        });
                    }
                } catch { }
            }
        }

        if (!songId) return;
        try {
            const newStatus = await libraryService.toggleFavorite(songId);

            // Update favoriteSet immediately for reactive UI
            set((state) => {
                const newFavoriteSet = new Set(state.favoriteSet);
                if (newStatus) {
                    newFavoriteSet.add(songId);
                } else {
                    newFavoriteSet.delete(songId);
                }
                return { favoriteSet: newFavoriteSet };
            });

            // 1. Update global library version to trigger refreshes in other components
            get().triggerLibraryUpdate();

            // 2. Update local playlist state if the song is present
            const { playlist, originalPlaylist } = get();

            const updateList = (list: SongMetadata[]) => list.map(s =>
                (s.id === songId || (songPath && s.path === songPath))
                    ? { ...s, is_favorite: newStatus }
                    : s
            );

            set({
                playlist: updateList(playlist),
                originalPlaylist: updateList(originalPlaylist)
            });

            // 3. Update Player Store Metadata if it's the current song
            const playerMetadata = usePlayerStore.getState().metadata;
            if (playerMetadata && (playerMetadata.id === songId || (songPath && playerMetadata.path === songPath))) {
                usePlayerStore.getState().setMetadata({ ...playerMetadata, is_favorite: newStatus });
            }

            // 4. Refresh from backend as backup (non-blocking)
            get().refreshFavorites();

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
        playlistSettings: state.playlistSettings
    }),
}));
