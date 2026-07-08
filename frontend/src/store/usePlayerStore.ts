import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LyricsData, LyricsLine, RepeatMode, SongMetadata } from '@/types/index';
import { audioService } from '@/services/audioService';

// 1. 确保接口里定义了所有属性和方法
interface PlayerState {
    // 状态字段
    isPlaying: boolean;
    volume: number;
    metadata: SongMetadata | null;
    isAudioLoaded: boolean;
    currentTime: number;
    playbackPath: string | null;
    playbackRevision: number;

    isShuffling: boolean;      // 随机状态
    repeatMode: RepeatMode;    // 循环模式

    // Setter 方法
    setIsPlaying: (isPlaying: boolean) => void;
    setVolume: (volume: number) => void;
    setMetadata: (metadata: SongMetadata | null) => void;
    setAudioLoaded: (loaded: boolean) => void;
    setPlaybackTime: (time: number) => void;
    resetPlaybackClock: (path?: string | null) => void;

    // 辅助 Setter (给 Library 用)
    setShuffleState: (state: boolean) => void;
    setRepeatState: (mode: RepeatMode) => void;

    // 动作方法 (这就是你报错缺失的部分)
    toggleShuffle: () => void;
    toggleRepeat: () => void;
    togglePlay: () => Promise<void>;

    restartTrigger: number;
    restartSong: () => void;

    // UI Persistence
    isQueueOpen: boolean;
    toggleQueue: () => void;

    // Lyrics
    isLyricsOpen: boolean;
    toggleLyrics: () => void;
    lyricsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    lyrics: LyricsLine[] | null;
    lyricsHasTimestamps: boolean;
    currentLyricsIndex: number;
    lyricsRequestId: number;
    lyricsPath: string | null;
    requestLyricsForPath: (path?: string) => Promise<void>;
    reloadLyricsForPath: (path: string) => Promise<void>;

    // Video Mode
    isVideoMode: boolean;
    setVideoMode: (enabled: boolean) => void;
    videoMetadata: SongMetadata | null;
    setVideoMetadata: (metadata: SongMetadata | null) => void;

    // Video Queue (Context)
    videoQueue: SongMetadata[];
    currentVideoIndex: number;
    setVideoQueue: (queue: SongMetadata[], startIndex: number) => void;
    playNextVideo: () => void;
    playPreviousVideo: () => void;
}

const sanitizeLyricsLines = (data: LyricsData | null): LyricsLine[] | null => {
    if (!data?.lines?.length) return null;
    if (!data.has_timestamps) {
        const lines = data.lines.map((line) => ({
            time_ms: null,
            text: line.text,
            translation: null,
            words: null,
            end_ms: null,
        }));
        return lines.some((line) => line.text.trim().length > 0) ? lines : null;
    }
    const lines = data.lines
        .map((line) => {
            const translation = line.translation ? line.translation.trim() : '';
            return {
                time_ms: line.time_ms ?? null,
                text: line.text.trim(),
                translation: translation.length > 0 ? translation : null,
                words: line.words && line.words.length > 0 ? line.words : null,
                end_ms: typeof line.end_ms === 'number' ? line.end_ms : null,
            };
        })
        // Keep timed entries even when their text is empty — those serve as
        // explicit interlude markers. Drop only fully empty untimed lines.
        .filter((line) => line.text.length > 0 || typeof line.time_ms === 'number');

    return lines.length > 0 ? lines : null;
};

export const usePlayerStore = create<PlayerState>()(persist((set, get) => ({
    // --- 初始状态 ---
    isPlaying: false,
    volume: 70,
    metadata: null,
    isAudioLoaded: false,
    currentTime: 0,
    playbackPath: null,
    playbackRevision: 0,
    isShuffling: false,
    repeatMode: 'off',
    isQueueOpen: false,
    isLyricsOpen: false,
    lyricsStatus: 'idle',
    lyrics: null,
    lyricsHasTimestamps: false,
    currentLyricsIndex: 0,
    lyricsRequestId: 0,
    lyricsPath: null,
    isVideoMode: false,
    videoMetadata: null,
    videoQueue: [],
    currentVideoIndex: -1,

    // --- Setter 实现 ---
    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setMetadata: (metadata) => set({ metadata }),
    setAudioLoaded: (loaded) => set({ isAudioLoaded: loaded }),
    setPlaybackTime: (time) => set({
        currentTime: Number.isFinite(time) ? Math.max(0, time) : 0,
    }),
    resetPlaybackClock: (path) => set((state) => ({
        currentTime: 0,
        playbackPath: path ?? null,
        playbackRevision: state.playbackRevision + 1,
    })),
    setVolume: (volume) => {
        set({ volume });
        audioService.setVolume(volume / 100);
    },
    setVideoMode: (enabled) => set({ isVideoMode: enabled }),

    setVideoMetadata: (metadata) => set({ videoMetadata: metadata }),
    setVideoQueue: (queue, startIndex) => set({ videoQueue: queue, currentVideoIndex: startIndex }),

    playNextVideo: () => {
        const { videoQueue, currentVideoIndex } = get();
        if (currentVideoIndex < videoQueue.length - 1) {
            const nextIndex = currentVideoIndex + 1;
            set({ currentVideoIndex: nextIndex, videoMetadata: videoQueue[nextIndex] });
        }
    },

    playPreviousVideo: () => {
        const { videoQueue, currentVideoIndex } = get();
        if (currentVideoIndex > 0) {
            const prevIndex = currentVideoIndex - 1;
            set({ currentVideoIndex: prevIndex, videoMetadata: videoQueue[prevIndex] });
        }
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
                // 变为单曲循环
                set({ repeatMode: 'one' });
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
                const currentTime = await audioService.getCurrentTime().catch(() => get().currentTime);
                set({
                    isPlaying: false,
                    currentTime: Number.isFinite(currentTime) ? Math.max(0, currentTime) : get().currentTime,
                });
            } else {
                // Check if audio is loaded. If not (and we have metadata), we must PLAY first to load it.
                // This happens when app restarts: metadata is restored but backend audio is empty.
                // NOTE: For video, we might handle this differently, but using standard audioService for now.
                const { isAudioLoaded, metadata } = get();
                if (!isAudioLoaded && metadata && metadata.path) {
                    await audioService.play(metadata.path, metadata);
                    set((state) => ({
                        isPlaying: true,
                        isAudioLoaded: true,
                        currentTime: 0,
                        playbackPath: metadata.path ?? null,
                        playbackRevision: state.playbackRevision + 1,
                    }));
                    get().requestLyricsForPath(metadata.path);
                } else {
                    await audioService.resume();
                    set({ isPlaying: true });
                }
            }
        } catch (error) {
            console.error('Toggle play failed', error);
            if (!isPlaying) set({ isPlaying: false });
        }
    },

    restartTrigger: 0,
    restartSong: () => set((state) => ({ restartTrigger: state.restartTrigger + 1 })),

    // UI States
    toggleQueue: () => set((state) => {
        const next = !state.isQueueOpen;
        return { isQueueOpen: next, isLyricsOpen: next ? false : state.isLyricsOpen };
    }),

    toggleLyrics: () => set((state) => {
        const next = !state.isLyricsOpen;
        return { isLyricsOpen: next, isQueueOpen: next ? false : state.isQueueOpen };
    }),

    requestLyricsForPath: async (path?: string) => {
        const { lyricsPath, lyricsStatus } = get();
        if (path && path === lyricsPath && (lyricsStatus === 'ready' || lyricsStatus === 'loading')) {
            return;
        }

        const requestId = get().lyricsRequestId + 1;
        set({
            lyricsRequestId: requestId,
            lyricsPath: path ?? null,
            lyricsStatus: path ? 'loading' : 'empty',
            lyrics: null,
            lyricsHasTimestamps: false,
            currentLyricsIndex: 0,
        });

        if (!path) return;

        try {
            const data = await audioService.getLyrics(path);
            const currentState = get();
            if (
                currentState.lyricsRequestId !== requestId ||
                currentState.metadata?.path !== path
            ) return;

            const lines = sanitizeLyricsLines(data);
            if (!lines) {
                set({ lyricsStatus: 'empty', lyrics: null, lyricsHasTimestamps: false });
                return;
            }

            set({
                lyricsStatus: 'ready',
                lyrics: lines,
                lyricsHasTimestamps: Boolean(data.has_timestamps),
                currentLyricsIndex: 0
            });
        } catch (error) {
            console.error('Failed to load lyrics', error);
            if (get().lyricsRequestId !== requestId) return;
            set({ lyricsStatus: 'error', lyrics: null, lyricsHasTimestamps: false });
        }
    },

    reloadLyricsForPath: async (path: string) => {
        set({
            lyricsPath: null,
            lyricsStatus: 'idle',
            lyrics: null,
            lyricsHasTimestamps: false,
        });
        await get().requestLyricsForPath(path);
    },
}), {
    name: 'player-store',
    partialize: (state) => ({
        volume: state.volume,
        isShuffling: state.isShuffling,
        repeatMode: state.repeatMode,
        isQueueOpen: state.isQueueOpen,
        // Don't persist isVideoMode, always start closed
    }),
}));
