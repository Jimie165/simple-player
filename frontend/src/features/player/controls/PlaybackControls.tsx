import { useState, useEffect, useRef } from 'react';
import {
    MdPlayCircle, MdPauseCircle, MdSkipPrevious, MdSkipNext, MdShuffle, MdRepeat
} from 'react-icons/md';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';
import { listen } from '@tauri-apps/api/event';
// Store & Services
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { audioService } from '@/services/audioService';
import { formatTime } from '@/utils/time';
// Components
import CustomTooltip from '@/components/common/CustomTooltip';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';

interface PlaybackControlsProps {
    mode: 'full' | 'compact' | 'mini';
}

export default function PlaybackControls({ mode }: PlaybackControlsProps) {
    const isMini = mode === 'mini';
    const {
        isPlaying, metadata,
        isShuffling, repeatMode,
        togglePlay, setIsPlaying,
        toggleRepeat,
        setMetadata,
        setAudioLoaded,
        restartTrigger, // Destructure trigger
        currentTime,
        setPlaybackTime,
        resetPlaybackClock,
        requestLyricsForPath,
    } = usePlayerStore();

    const { playlist, currentSongIndex, getNextIndex, setCurrentSongIndex, pushHistory, popHistory } = useLibraryStore();
    const { toggleShuffle, seek } = usePlaybackActions();

    const [isDragging, setIsDragging] = useState(false);
    const [isRemoteDragging, setIsRemoteDragging] = useState(false);

    const isAutoChanging = useRef(false);

    // --- 监听 Metadata 变化，添加到最近播放 ---
    // 已移除：根据用户需求，仅手动点播（点击列表项）才加入最近播放。
    // 自动切歌和播放器内的上一首/下一首按钮不再记录。

    // --- 核心修复：切歌/播放执行函数 ---
    const playSongByIndex = async (index: number, autoPlay: boolean = true) => {
        // 增加安全校验：如果索引无效，解锁并退出
        if (index < 0 || index >= playlist.length) {
            isAutoChanging.current = false;
            return;
        }

        const song = playlist[index];
        if (!song.path) {
            isAutoChanging.current = false;
            return;
        }

        try {
            // 1. 先播放或加载 (Play or Load)
            await audioService.play(song.path, song);

            if (!autoPlay) {
                // 如果不自动播放（例如列表播完回到开头暂停），马上暂停并重置进度
                await audioService.pause();
                await seek(0);
            }

            // 2. 成功后更新 UI (Update UI Later)
            setMetadata(song);
            setCurrentSongIndex(index);
            resetPlaybackClock(song.path);
            window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: 0 } }));
            requestLyricsForPath(song.path);

            if (autoPlay) {
                setIsPlaying(true);
                setAudioLoaded(true);
            } else {
                setIsPlaying(false);
            }

        } catch (err) {
            console.error("Play failed", err);
            // 播放失败，不更新 UI，保持在上一首 (或者显示错误 toast)
            toast.error("播放失败，请检查文件是否存在");
        } finally {
            // 确保在 500ms 后释放锁，防止连续触发
            setTimeout(() => {
                isAutoChanging.current = false;
            }, 500);
        }
    };

    // --- 按钮逻辑：下一首 ---
    const handleNext = async () => {
        // 手动点击：无视锁，直接切
        pushHistory(currentSongIndex);
        const len = playlist.length;
        if (len === 0) return;

        // 逻辑：手动点击下一首，即使是单曲循环，也切到下一首
        const nextIdx = (currentSongIndex + 1) % len;
        playSongByIndex(nextIdx);
    };

    // --- 按钮逻辑：上一首 ---
    const handlePrev = async () => {
        const len = playlist.length;
        if (len === 0) return;

        // 3秒规则
        if (currentTime > 3) {
            const actualTime = await seek(0);
            setPlaybackTime(actualTime);
            return;
        }

        const historyIndex = popHistory();
        if (historyIndex !== undefined) {
            // 历史记录中的索引对应的歌可能已经不在列表里了（如果被删），但通常还在
            // 加一个边界检查
            if (historyIndex >= 0 && historyIndex < len) {
                playSongByIndex(historyIndex);
            } else {
                // Fallback
                const prevIdx = (currentSongIndex - 1 + len) % len;
                playSongByIndex(prevIdx);
            }
        } else {
            const prevIdx = (currentSongIndex - 1 + len) % len;
            playSongByIndex(prevIdx);
        }
    };

    // --- 歌曲自然结束的处理逻辑 ---
    const handleSongEnded = () => {
        // 检查锁，防止重复触发
        if (isAutoChanging.current) return;
        isAutoChanging.current = true;

        if (repeatMode === 'one') {
            // 单曲循环：重播当前
            playSongByIndex(currentSongIndex);
        } else {
            // 列表播放：切下一首
            pushHistory(currentSongIndex);
            const nextIdx = getNextIndex(repeatMode);

            if (nextIdx === -1) {
                console.log("Playlist ended, returning to start of current song.");
                playSongByIndex(currentSongIndex, false);
            } else {
                playSongByIndex(nextIdx);
            }
        }
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
                        return { currentTime: 0 };
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
            // 这里也加一道解锁保险
            isAutoChanging.current = false;
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
    const progressPercent = metadata && metadata.duration > 0 ? (currentTime / metadata.duration) * 100 : 0;
    const displayCurrentTime = Math.max(0, Math.floor(currentTime));
    const displayDuration = Math.max(0, Math.floor(metadata?.duration || 0));
    const remainingTime = Math.max(displayDuration - displayCurrentTime, 0);

    return (
        <>
            <div className={clsx(
                "relative z-10 row-start-1 flex min-w-0 items-center gap-1.5",
                isMini ? "col-start-2 justify-end gap-2" : "col-start-1 justify-center"
            )}>

                {/* 随机按钮 */}
                <div className={clsx(isMini && "hidden")}>
                    <CustomTooltip text={"随机播放"}>
                        <button
                            onClick={handleBtnShuffle}
                            className={clsx(
                                "grid h-7 w-7 place-items-center rounded-full text-[17px] transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                                isShuffling
                                    ? "text-primary"
                                    : "text-neutral-700 dark:text-white/70"
                            )}
                        >
                            <MdShuffle />
                        </button>
                    </CustomTooltip>
                </div>

                {/* 上一首 */}
                <CustomTooltip text="上一首">
                    <button onClick={handlePrev} className={clsx(
                        "grid h-7 w-7 place-items-center rounded-full text-[23px] text-neutral-900 transition-all hover:bg-black/5 active:scale-90 dark:text-white/88 dark:hover:bg-white/10",
                        isMini && "hidden"
                    )}>
                        <MdSkipPrevious />
                    </button>
                </CustomTooltip>

                {/* 播放/暂停 */}
                <CustomTooltip text={!metadata ? "没有歌曲" : (isPlaying ? "暂停" : "播放")}>
                    <button
                        onClick={metadata ? togglePlay : undefined}
                        disabled={!metadata}
                        className={clsx(
                            "grid place-items-center rounded-full transition-all active:scale-95",
                            isMini ? "h-11 w-11 text-[44px]" : "h-8 w-8 text-[32px]",
                            metadata
                                ? "cursor-pointer text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:text-primary/90 hover:scale-[1.04]"
                                : "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
                        )}
                    >
                        {isPlaying ? <MdPauseCircle /> : <MdPlayCircle />}
                    </button>
                </CustomTooltip>

                {/* 下一首 */}
                <CustomTooltip text="下一首">
                    <button onClick={handleNext} className={clsx(
                        "grid place-items-center rounded-full text-neutral-900 transition-all hover:bg-black/5 active:scale-90 dark:text-white/88 dark:hover:bg-white/10",
                        isMini ? "h-10 w-10 text-[34px]" : "h-7 w-7 text-[23px]"
                    )}>
                        <MdSkipNext />
                    </button>
                </CustomTooltip>

                {/* 循环按钮 */}
                <div className={clsx(isMini && "hidden")}>
                    <CustomTooltip text={
                        repeatMode === 'off' ? "重复播放已关闭" :
                            repeatMode === 'all' ? "重复播放全部" : "单曲循环"
                    }>
                        <button
                            onClick={handleBtnRepeat}
                            className={clsx(
                                "relative grid h-7 w-7 place-items-center rounded-full text-[17px] transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                                repeatMode !== 'off'
                                    ? "text-primary"
                                    : "text-neutral-700 dark:text-white/70"
                            )}
                        >
                            <MdRepeat />
                            {repeatMode === 'one' && (
                                <span className="absolute top-[5px] right-[5px] grid h-2.5 w-2.5 place-items-center rounded-full bg-white text-[7px] font-bold leading-none text-primary dark:bg-neutral-950">1</span>
                            )}
                        </button>
                    </CustomTooltip>
                </div>
            </div>

            {/* 进度条 */}
            <div className={clsx(
                "z-20 col-start-2 col-end-4 row-start-1 mb-1 ml-[68px] flex self-end text-[10px] font-medium text-neutral-500 dark:text-white/50",
                mode === 'full' && "mr-[104px]",
                mode === 'compact' && "mr-8",
                isMini && "hidden"
            )}>
                <div className="group relative flex h-5 flex-1 items-center">
                    <span className="pointer-events-none absolute -top-1.5 left-0 text-[10px] font-medium tabular-nums leading-none text-neutral-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-white/84">
                        {formatTime(displayCurrentTime)}
                    </span>
                    <span className="pointer-events-none absolute -top-1.5 right-0 text-[10px] font-medium tabular-nums leading-none text-neutral-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-white/84">
                        -{formatTime(remainingTime)}
                    </span>
                    <div className="pointer-events-none absolute left-0 right-0 h-[3px] overflow-hidden rounded-full bg-black/[0.075] transition-[height] group-hover:h-1 dark:bg-white/[0.12]"></div>
                    <div className="pointer-events-none absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-primary/90 transition-[height] group-hover:h-1" style={{ width: `${progressPercent}%` }} />
                    <div
                        className={clsx(
                            "absolute top-1/2 -mt-1.5 h-3 w-3 rounded-full bg-primary/95 opacity-0 shadow-[0_1px_4px_rgba(0,0,0,0.18)] transition-opacity duration-200 group-hover:opacity-100",
                            isDragging && "opacity-100 scale-125"
                        )}
                        style={{ left: `${progressPercent}%`, marginLeft: '-6px' }}
                    />
                    {/* 只有在有歌曲时才允许拖动进度条 */}
                    {metadata && (
                        <input type="range" min="0" max={metadata?.duration || 100} value={currentTime} onMouseDown={handleSeekStart} onChange={handleSeekChange} onMouseUp={handleSeekEnd} className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer" />
                    )}
                </div>
            </div>
        </>
    );
}
