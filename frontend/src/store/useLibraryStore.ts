import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RecentItem, SongMetadata } from '../types/index';

interface LibraryState {
    // ... 其他状态保持不变
    recentHistory: RecentItem[];
    playHistory: number[];
    playlist: SongMetadata[];
    originalPlaylist: SongMetadata[];
    currentSongIndex: number;

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

    // Add to Queue (Add to end of playlist)
    addToPlaylist: (song: SongMetadata) => void;
    // Add to Next (Insert after current song)
    addToNext: (song: SongMetadata) => void;

    // Library Version for Sync
    libraryVersion: number;
    triggerLibraryUpdate: () => void;
}

export const useLibraryStore = create<LibraryState>()(persist((set, get) => ({
    // ... 前面的状态和函数保持不变 ...
    recentHistory: [],
    playHistory: [],
    playlist: [],
    originalPlaylist: [],
    currentSongIndex: -1,

    addToRecent: (item) => set((state) => {
        // 使用 id 去重而不是 path，因为专辑的 id 是 album:name:artist 格式
        const filtered = state.recentHistory.filter(i => i.id !== item.id);
        return { recentHistory: [item, ...filtered].slice(0, 100) };
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
            if (originalPlaylist.length === 0) return;

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

    removeSongFromPlaylist: (path) => {
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
            // 如果移除的是当前播放的歌，是否需要切歌由组件层决定，这里只保证索引指向合理位置
            // 如果只有这一首，变成 -1
            if (newPlaylist.length === 0) {
                newIndex = -1;
            } else if (newIndex >= newPlaylist.length) {
                // 如果是最后一首，指向新的最后一首
                newIndex = newPlaylist.length - 1;
            }
            // 如果不是最后一首，索引不变，指向下一首（原 index 指向的位置现在是下一首了）
        } else {
            // 如果移除的是当前之前的歌，索引减一
            const removedIndex = playlist.findIndex(s => s.path === path);
            if (removedIndex !== -1 && removedIndex < currentSongIndex) {
                newIndex = currentSongIndex - 1;
            }
        }

        set({
            playlist: newPlaylist,
            originalPlaylist: newOriginalPlaylist,
            currentSongIndex: newIndex,
            // 简单处理：清空播放历史，防止 history 指向错误的 index
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
}), {
    name: 'library-store',
    partialize: (state) => ({ recentHistory: state.recentHistory }),
}));
