import { create } from 'zustand';
import type { RecentItem, SongMetadata } from '../types/index';

interface LibraryState {
    // ... 其他状态保持不变
    recentHistory: RecentItem[];
    playHistory: number[];
    playlist: SongMetadata[];
    originalPlaylist: SongMetadata[];
    currentSongIndex: number;

    addToRecent: (item: RecentItem) => void;
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
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
    // ... 前面的状态和函数保持不变 ...
    recentHistory: [],
    playHistory: [],
    playlist: [],
    originalPlaylist: [],
    currentSongIndex: -1,

    addToRecent: (item) => set((state) => {
        const filtered = state.recentHistory.filter(i => i.path !== item.path);
        return { recentHistory: [item, ...filtered].slice(0, 100) };
    }),

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
        // ... 保持之前的物理洗牌逻辑不变 ...
        const { originalPlaylist, playlist, currentSongIndex } = get();
        const currentSong = playlist[currentSongIndex];

        if (enable) {
            if (originalPlaylist.length === 0) return;
            let shuffled = [...originalPlaylist];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            let newIndex = 0;
            if (currentSong) {
                newIndex = shuffled.findIndex(s => s.path === currentSong.path);
                if (newIndex === -1) newIndex = 0;
            }
            set({ playlist: shuffled, currentSongIndex: newIndex, playHistory: [] });
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
    }
}));