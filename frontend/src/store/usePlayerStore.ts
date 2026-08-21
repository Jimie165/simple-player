import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LyricsDocument, MediaKind, PlaybackSnapshot, RepeatMode, SongMetadata } from '@/types/index';
import { audioService } from '@/services/audioService';

// 1. 确保接口里定义了所有属性和方法
interface PlayerState {
    // 状态字段
    isPlaying: boolean;
    volume: number;
    metadata: SongMetadata | null;
    isAudioLoaded: boolean;
    currentTime: number;
    isSeeking: boolean;
    playbackPath: string | null;
    playbackRevision: number;
    playbackSessionId: number;
    mediaKind: MediaKind;

    isShuffling: boolean;      // 随机状态
    repeatMode: RepeatMode;    // 循环模式

    // Setter 方法
    setVolume: (volume: number) => void;
    setMetadata: (metadata: SongMetadata | null) => void;
    setPlaybackTime: (time: number) => void;
    setPlaybackSnapshot: (snapshot: PlaybackSnapshot) => void;
    setMediaKind: (kind: MediaKind) => void;
    setSeeking: (seeking: boolean) => void;
    resetPlaybackClock: (path?: string | null) => void;

    // 辅助 Setter (给 Library 用)
    setShuffleState: (state: boolean) => void;
    setRepeatState: (mode: RepeatMode) => void;

    // 动作方法 (这就是你报错缺失的部分)
    toggleShuffle: () => void;
    toggleRepeat: () => void;

    restartTrigger: number;
    restartSong: () => void;

    // UI Persistence
    isQueueOpen: boolean;
    toggleQueue: () => void;

    // Lyrics
    isLyricsOpen: boolean;
    toggleLyrics: () => void;
    lyricsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    lyricsDocument: LyricsDocument | null;
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

export const usePlayerStore = create<PlayerState>()(persist((set, get) => ({
    // --- 初始状态 ---
    isPlaying: false,
    volume: 70,
    metadata: null,
    isAudioLoaded: false,
    currentTime: 0,
    isSeeking: false,
    playbackPath: null,
    playbackRevision: 0,
    playbackSessionId: 0,
    mediaKind: null,
    isShuffling: false,
    repeatMode: 'off',
    isQueueOpen: false,
    isLyricsOpen: false,
    lyricsStatus: 'idle',
    lyricsDocument: null,
    lyricsRequestId: 0,
    lyricsPath: null,
    isVideoMode: false,
    videoMetadata: null,
    videoQueue: [],
    currentVideoIndex: -1,

    // --- Setter 实现 ---
    setMetadata: (metadata) => set({ metadata }),
    setPlaybackTime: (time) => set({
        currentTime: Number.isFinite(time) ? Math.max(0, time) : 0,
    }),
    setPlaybackSnapshot: (snapshot) => set((state) => {
        // A stopped monitor can finish after a new track has already replaced it.
        // Never let that stale session move the visible player backwards.
        if (
            snapshot.session_id !== 0 &&
            state.playbackSessionId !== 0 &&
            snapshot.session_id < state.playbackSessionId
        ) {
            return state;
        }

        return {
            isPlaying: snapshot.status === 'playing',
            isAudioLoaded: snapshot.status !== 'idle',
            currentTime: Number.isFinite(snapshot.position) ? Math.max(0, snapshot.position) : 0,
            isSeeking: state.isSeeking,
            playbackPath: snapshot.path,
            mediaKind: snapshot.status === 'idle' ? null : 'audio',
            volume: snapshot.volume * 100,
            playbackRevision: snapshot.session_id !== 0 && snapshot.session_id !== state.playbackSessionId
                ? state.playbackRevision + 1
                : state.playbackRevision,
            playbackSessionId: snapshot.session_id,
        };
    }),
    setMediaKind: (mediaKind) => set({ mediaKind }),
    setSeeking: (isSeeking) => set({ isSeeking }),
    resetPlaybackClock: (path) => set((state) => ({
        currentTime: 0,
        isSeeking: false,
        playbackPath: path ?? null,
        playbackRevision: state.playbackRevision + 1,
    })),
    setVolume: (volume) => set({ volume }),
    setVideoMode: (enabled) => set({
        isVideoMode: enabled,
        ...(enabled ? {} : { mediaKind: null }),
    }),

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

    // --- Action state helpers ---

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
            lyricsDocument: null,
        });

        if (!path) return;

        try {
            const document = await audioService.getLyrics(path);
            const currentState = get();
            if (
                currentState.lyricsRequestId !== requestId ||
                currentState.metadata?.path !== path
            ) return;

            if (!document.lines.length) {
                set({ lyricsStatus: 'empty', lyricsDocument: null });
                return;
            }

            set({ lyricsStatus: 'ready', lyricsDocument: document });
        } catch (error) {
            console.error('Failed to load lyrics', error);
            if (get().lyricsRequestId !== requestId) return;
            set({ lyricsStatus: 'error', lyricsDocument: null });
        }
    },

    reloadLyricsForPath: async (path: string) => {
        set({
            lyricsPath: null,
            lyricsStatus: 'idle',
            lyricsDocument: null,
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
    // Zustand 只恢复前端状态；同时把持久化音量写回后端，避免 UI 与实际播放音量脱节。
    onRehydrateStorage: () => (state, error) => {
        if (error) {
            console.error('Failed to restore player settings', error);
            return;
        }

        if (state) {
            void audioService.setVolume(state.volume / 100).catch((restoreError) => {
                console.error('Failed to restore audio volume', restoreError);
            });
        }
    },
}));
