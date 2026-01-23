import { create } from 'zustand';
import type { SongMetadata, RepeatMode } from '../types/index';
import { audioService } from '../services/audioService';

// 1. 确保接口里定义了所有属性和方法
interface PlayerState {
    // 状态字段
    isPlaying: boolean;
    volume: number;
    metadata: SongMetadata | null;

    isShuffling: boolean;      // 随机状态
    repeatMode: RepeatMode;    // 循环模式

    // Setter 方法
    setIsPlaying: (isPlaying: boolean) => void;
    setVolume: (volume: number) => void;
    setMetadata: (metadata: SongMetadata | null) => void;

    // 辅助 Setter (给 Library 用)
    setShuffleState: (state: boolean) => void;
    setRepeatState: (mode: RepeatMode) => void;

    // 动作方法 (这就是你报错缺失的部分)
    toggleShuffle: () => void;
    toggleRepeat: () => void;
    togglePlay: () => Promise<void>;

    restartTrigger: number;
    restartSong: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
    // --- 初始状态 ---
    isPlaying: false,
    volume: 70,
    metadata: null,
    isShuffling: false,
    repeatMode: 'off',

    // --- Setter 实现 ---
    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setMetadata: (metadata) => set({ metadata }),
    setVolume: (volume) => {
        set({ volume });
        audioService.setVolume(volume / 100);
    },

    setShuffleState: (state) => set({ isShuffling: state }),
    setRepeatState: (mode) => set({ repeatMode: mode }),

    // --- 动作实现 ---

    // 切换随机 (开/关)
    toggleShuffle: () => {
        const { isShuffling } = get();
        set({ isShuffling: !isShuffling });
    },

    // 切换循环 (Off -> All -> One -> Off)
    toggleRepeat: () => {
        const { repeatMode } = get();

        switch (repeatMode) {
            case 'off':
                // 变为列表循环
                set({ repeatMode: 'all' });
                break;
            case 'all':
                // 变为单曲循环 (同时关闭随机，遵循你的需求)
                set({ repeatMode: 'one', isShuffling: false });
                break;
            case 'one':
                // 关闭循环
                set({ repeatMode: 'off' });
                break;
        }
    },

    togglePlay: async () => {
        const { isPlaying } = get();
        try {
            if (isPlaying) {
                await audioService.pause();
                set({ isPlaying: false });
            } else {
                await audioService.resume();
                set({ isPlaying: true });
            }
        } catch (error) {
            console.error('Toggle play failed', error);
            // If we failed to resume, ensure UI shows paused.
            // If we failed to pause, well, UI probably should show paused to let user try again?
            // Let's assume sync failed, maybe fetch status? For now, just ensure consistent internal state
            // If exception, likely backend is unhappy, so default to not playing.
            if (!isPlaying) set({ isPlaying: false });
        }
    },

    restartTrigger: 0,
    restartSong: () => set((state) => ({ restartTrigger: state.restartTrigger + 1 })),
}));