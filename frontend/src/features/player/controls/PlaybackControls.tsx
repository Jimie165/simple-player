import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
// Store & Services
import { usePlayerStore } from '@/store/usePlayerStore';
import { audioService } from '@/services/audioService';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { PlaybackControlButtons } from '@/features/player/controls/PlaybackControlButtons';
import { PlaybackProgressBar } from '@/features/player/controls/PlaybackProgressBar';

interface PlaybackControlsProps {
    mode: 'full' | 'compact' | 'mini';
}

interface PlaybackProgressClockProps {
    mode: PlaybackControlsProps['mode'];
    isMini: boolean;
    metadata: ReturnType<typeof usePlayerStore.getState>['metadata'];
    isDragging: boolean;
    handleSeekStart: () => void;
    handleSeekChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handleSeekEnd: (event: React.MouseEvent<HTMLInputElement>) => void;
}

function PlaybackProgressClock({
    mode,
    isMini,
    metadata,
    isDragging,
    handleSeekStart,
    handleSeekChange,
    handleSeekEnd,
}: PlaybackProgressClockProps) {
    const currentTime = usePlayerStore(state => state.currentTime);
    const progressPercent = metadata && metadata.duration > 0 ? (currentTime / metadata.duration) * 100 : 0;
    const displayCurrentTime = Math.max(0, Math.floor(currentTime));
    const displayDuration = Math.max(0, Math.floor(metadata?.duration || 0));
    const remainingTime = Math.max(displayDuration - displayCurrentTime, 0);

    return (
        <PlaybackProgressBar
            mode={mode}
            isMini={isMini}
            metadata={metadata}
            currentTime={currentTime}
            displayCurrentTime={displayCurrentTime}
            remainingTime={remainingTime}
            progressPercent={progressPercent}
            isDragging={isDragging}
            handleSeekStart={handleSeekStart}
            handleSeekChange={handleSeekChange}
            handleSeekEnd={handleSeekEnd}
        />
    );
}

export default function PlaybackControls({ mode }: PlaybackControlsProps) {
    const isMini = mode === 'mini';
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const metadata = usePlayerStore(state => state.metadata);
    const isShuffling = usePlayerStore(state => state.isShuffling);
    const repeatMode = usePlayerStore(state => state.repeatMode);
    const togglePlay = usePlayerStore(state => state.togglePlay);
    const setIsPlaying = usePlayerStore(state => state.setIsPlaying);
    const toggleRepeat = usePlayerStore(state => state.toggleRepeat);
    const restartTrigger = usePlayerStore(state => state.restartTrigger);
    const setPlaybackTime = usePlayerStore(state => state.setPlaybackTime);
    const resetPlaybackClock = usePlayerStore(state => state.resetPlaybackClock);

    const { toggleShuffle, seek, playNext, playPrev, handlePlaybackEnded } = usePlaybackActions();

    const [isDragging, setIsDragging] = useState(false);
    const [isRemoteDragging, setIsRemoteDragging] = useState(false);

    // --- 监听 Metadata 变化，添加到最近播放 ---
    // 已移除：根据用户需求，仅手动点播（点击列表项）才加入最近播放。
    // 自动切歌和播放器内的上一首/下一首按钮不再记录。

    // --- 按钮逻辑：下一首 ---
    const handleNext = async () => {
        await playNext();
    };

    // --- 按钮逻辑：上一首 ---
    const handlePrev = async () => {
        await playPrev(usePlayerStore.getState().currentTime);
    };

    // --- 歌曲自然结束的处理逻辑 ---
    const handleSongEnded = () => {
        void handlePlaybackEnded();
    };

    const handleBtnShuffle = () => {
        toggleShuffle();
    };

    const handleBtnRepeat = () => {
        // Current: off -> all -> one -> off
        // 状态流转完全由 Store 控制
        toggleRepeat();
    };



    // --- 监听 SMTC 事件（Windows 媒体控制按钮）---
    const handleNextRef = useRef(handleNext);
    const handlePrevRef = useRef(handlePrev);
    const handleSongEndedRef = useRef(handleSongEnded);

    // 保持 ref 更新
    useEffect(() => {
        handleNextRef.current = handleNext;
        handlePrevRef.current = handlePrev;
        handleSongEndedRef.current = handleSongEnded; // Keep ref updated
    });

    useEffect(() => {
        let unlistenNext: (() => void) | undefined;
        let unlistenPrev: (() => void) | undefined;
        let unlistenPlay: (() => void) | undefined;
        let unlistenPause: (() => void) | undefined;
        let unlistenSeek: (() => void) | undefined;
        let unlistenEnded: (() => void) | undefined;
        let isMounted = true;

        const handleSeekEvent = (event: Event) => {
            const detail = (event as CustomEvent<{ time?: unknown }>).detail;
            if (detail && typeof detail.time === 'number') {
                setPlaybackTime(detail.time);
            }
        };
        const handleRemoteDraggingEvent = (event: Event) => {
            const detail = (event as CustomEvent<{ dragging?: unknown }>).detail;
            if (detail && typeof detail.dragging === 'boolean') {
                setIsRemoteDragging(detail.dragging);
            }
        };
        window.addEventListener('playback:seeked', handleSeekEvent);
        window.addEventListener('playback:dragging', handleRemoteDraggingEvent);

        const setupListeners = async () => {
            try {
                const nextFn = await listen('smtc:next', () => {
                    handleNextRef.current();
                });
                if (isMounted) {
                    unlistenNext = nextFn;
                } else {
                    nextFn();
                }

                const prevFn = await listen('smtc:previous', () => {
                    handlePrevRef.current();
                });
                if (isMounted) {
                    unlistenPrev = prevFn;
                } else {
                    prevFn();
                }

                // --- 监听 SMTC 播放/暂停 ---
                const playFn = await listen('smtc:play', async () => {
                    const { isAudioLoaded, metadata, setIsPlaying, setAudioLoaded } = usePlayerStore.getState();

                    if (!isAudioLoaded && metadata?.path) {
                        try {
                            await audioService.play(metadata.path, metadata);
                            setIsPlaying(true);
                            setAudioLoaded(true);
                        } catch (error) {
                            console.error("SMTC Auto Play failed:", error);
                        }
                    } else {
                        // 如果已经 Loaded，则直接 Resume
                        await audioService.resume();
                        setIsPlaying(true);
                    }
                });
                if (isMounted) {
                    unlistenPlay = playFn;
                } else {
                    playFn();
                }

                const pauseFn = await listen('smtc:pause', async () => {
                    await audioService.pause();
                    const currentTime = await audioService.getCurrentTime().catch(() => usePlayerStore.getState().currentTime);
                    usePlayerStore.setState({
                        isPlaying: false,
                        currentTime: Number.isFinite(currentTime)
                            ? Math.max(0, currentTime)
                            : usePlayerStore.getState().currentTime,
                    });
                });
                if (isMounted) {
                    unlistenPause = pauseFn;
                } else {
                    pauseFn();
                }

                const seekFn = await listen<number>('smtc:seek', async (event) => {
                    const requestedTime = Number(event.payload);
                    if (!Number.isFinite(requestedTime)) return;

                    try {
                        const actualTime = await audioService.seek(requestedTime);
                        setPlaybackTime(actualTime);
                        window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: actualTime } }));
                    } catch (error) {
                        console.error("SMTC seek failed:", error);
                    }
                });
                if (isMounted) {
                    unlistenSeek = seekFn;
                } else {
                    seekFn();
                }

                // --- 核心修复：监听后端发送的播放结束事件 ---
                const endedFn = await listen('audio:ended', () => {
                    console.log("Audio ended event received from backend.");
                    handleSongEndedRef.current();
                });
                if (isMounted) {
                    unlistenEnded = endedFn;
                } else {
                    endedFn();
                }
            } catch (err) {
                console.error("Error setting up listeners:", err);
            }
        };

        setupListeners();

        return () => {
            isMounted = false;
            // Safely unlisten
            const safeUnlisten = (fn: (() => void) | undefined) => {
                if (fn) {
                    try {
                        Promise.resolve(fn()).catch((e: unknown) => console.warn("Failed to unlisten (async)", e));
                    } catch (e) {
                        console.warn("Failed to unlisten (sync)", e);
                    }
                }
            };
            safeUnlisten(unlistenNext);
            safeUnlisten(unlistenPrev);
            safeUnlisten(unlistenPlay);
            safeUnlisten(unlistenPause);
            safeUnlisten(unlistenSeek);
            safeUnlisten(unlistenEnded);
            window.removeEventListener('playback:seeked', handleSeekEvent);
            window.removeEventListener('playback:dragging', handleRemoteDraggingEvent);
        };
    }, [setIsPlaying, setPlaybackTime]);

    // --- 自动播放监听 ---
    // --- 进度条更新与兜底检测 ---
    useEffect(() => {
        let interval: number;

        if (isPlaying && !isDragging && !isRemoteDragging) {
            // 改为 500ms 更新一次，响应更灵敏
            interval = window.setInterval(() => {
                usePlayerStore.setState((state) => {
                    const prev = state.currentTime;
                    // 兜底检测 (防止后端事件丢失)
                    if (metadata && metadata.duration > 0 && prev >= metadata.duration - 0.5) {
                        handleSongEndedRef.current();
                        return {};
                    }
                    return { currentTime: prev + 0.5 };
                });
            }, 500);
        }
        return () => clearInterval(interval);
    }, [isPlaying, isDragging, isRemoteDragging, metadata]);

    // Metadata 变化时的兜底重置 (比如从 Library 切歌)
    const prevSongKeyRef = useRef<string>('');
    const prevRestartRef = useRef<number>(restartTrigger);
    useEffect(() => {
        const songKey = metadata?.id !== undefined
            ? `id:${metadata.id}`
            : (metadata?.path ? `path:${metadata.path}` : '');

        const restartChanged = prevRestartRef.current !== restartTrigger;
        const songChanged = songKey !== prevSongKeyRef.current;

        if (restartChanged || songChanged) {
            resetPlaybackClock(metadata?.path ?? null);
            window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: 0 } }));
        }

        prevRestartRef.current = restartTrigger;
        prevSongKeyRef.current = songKey;
    }, [metadata, restartTrigger, resetPlaybackClock]);

    // 拖拽处理
    const handleSeekStart = () => setIsDragging(true);
    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        setPlaybackTime(time);
        // Real-time sync for other components (like immersive player)
        window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time } }));
    };
    const handleSeekEnd = async (e: React.MouseEvent<HTMLInputElement>) => {
        const newTime = Number((e.currentTarget as HTMLInputElement).value);
        setIsDragging(false);
        const actualTime = await seek(newTime); // Use hook action to ensure consistent behavior & event dispatch
        setPlaybackTime(actualTime);
    };
    return (
        <>
            <PlaybackControlButtons
                isMini={isMini}
                metadata={metadata}
                isPlaying={isPlaying}
                isShuffling={isShuffling}
                repeatMode={repeatMode}
                togglePlay={togglePlay}
                handlePrev={handlePrev}
                handleNext={handleNext}
                handleBtnShuffle={handleBtnShuffle}
                handleBtnRepeat={handleBtnRepeat}
            />

            <PlaybackProgressClock
                mode={mode}
                isMini={isMini}
                metadata={metadata}
                isDragging={isDragging}
                handleSeekStart={handleSeekStart}
                handleSeekChange={handleSeekChange}
                handleSeekEnd={handleSeekEnd}
            />
        </>
    );
}
