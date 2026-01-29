import { useState, useEffect, useRef } from 'react';
import {
    MdPlayCircle, MdPauseCircle, MdSkipPrevious, MdSkipNext, MdShuffle, MdRepeat
} from 'react-icons/md';
import clsx from 'clsx';
import { listen } from '@tauri-apps/api/event';
// Store & Services
import { usePlayerStore } from '../../../store/usePlayerStore';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { audioService } from '../../../services/audioService';
import { formatTime } from '../../../utils/time';
// Components
import CustomTooltip from '../../../components/common/CustomTooltip';
import { usePlaybackActions } from '../../../hooks/usePlaybackActions';

export default function PlaybackControls() {
    const {
        isPlaying, metadata,
        isShuffling, repeatMode,
        togglePlay, setIsPlaying,
        toggleRepeat,
        setMetadata,
        restartTrigger // Destructure trigger
    } = usePlayerStore();

    const { playlist, currentSongIndex, getNextIndex, setCurrentSongIndex, pushHistory, popHistory } = useLibraryStore();
    const { toggleShuffle } = usePlaybackActions();

    const [currentTime, setCurrentTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isRemoteDragging, setIsRemoteDragging] = useState(false);

    // 防抖锁：防止自动播放时连续跳过
    const isAutoChanging = useRef(false);

    // ... (keep playSongByIndex and others)

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
            // 1. 先播放 (Play First)
            if (autoPlay) {
                await audioService.play(song.path, song);
            } else {
                // 如果不自动播放（例如列表播完回到开头暂停），只需设置 Metadata
                // 但为了保险，还是加载但不播？或者只设置 UI
                // 这里假设不自动播放意味着停止
            }

            // 2. 成功后更新 UI (Update UI Later)
            setMetadata(song);
            setCurrentSongIndex(index);
            setCurrentTime(0); // 放在成功后，避免视觉跳动

            if (autoPlay) {
                setIsPlaying(true);
            } else {
                setIsPlaying(false);
                // 如果不播，可能需要通知后端暂停或停止
                await audioService.pause();
            }

        } catch (err) {
            console.error("Play failed", err);
            // 播放失败，不更新 UI，保持在上一首 (或者显示错误 toast)
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
            await audioService.seek(0);
            setCurrentTime(0);
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
                console.log("Playlist ended, returning to start.");
                playSongByIndex(0, false);
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
        let unlistenEnded: (() => void) | undefined;
        let isMounted = true;

        const handleSeekEvent = (e: any) => {
            if (e.detail && typeof e.detail.time === 'number') {
                setCurrentTime(e.detail.time);
            }
        };
        const handleRemoteDraggingEvent = (e: any) => {
            if (e.detail && typeof e.detail.dragging === 'boolean') {
                setIsRemoteDragging(e.detail.dragging);
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
                        const result = fn() as any;
                        if (result instanceof Promise) {
                            result.catch((e: any) => console.warn("Failed to unlisten (async)", e));
                        }
                    } catch (e) {
                        console.warn("Failed to unlisten (sync)", e);
                    }
                }
            };
            safeUnlisten(unlistenNext);
            safeUnlisten(unlistenPrev);
            safeUnlisten(unlistenEnded);
            window.removeEventListener('playback:seeked', handleSeekEvent);
            window.removeEventListener('playback:dragging', handleRemoteDraggingEvent);
        };
    }, []); // 依赖项始终为空，只在挂载/卸载时执行

    // --- 自动播放监听 ---
    // --- 进度条更新与兜底检测 ---
    useEffect(() => {
        let interval: number;

        if (isPlaying && !isDragging && !isRemoteDragging) {
            // 改为 500ms 更新一次，响应更灵敏
            interval = window.setInterval(() => {
                setCurrentTime((prev) => {
                    // 兜底检测 (防止后端事件丢失)
                    if (metadata && metadata.duration > 0 && prev >= metadata.duration - 0.5) {
                        handleSongEnded();
                        return 0;
                    }
                    return prev + 0.5;
                });
            }, 500);
        }
        return () => clearInterval(interval);
    }, [isPlaying, isDragging, isRemoteDragging, metadata, repeatMode, playlist, currentSongIndex]);

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
            setCurrentTime(0);
            // 这里也加一道解锁保险
            isAutoChanging.current = false;
        }

        prevRestartRef.current = restartTrigger;
        prevSongKeyRef.current = songKey;
    }, [metadata, restartTrigger]);

    // 拖拽处理
    const handleSeekStart = () => setIsDragging(true);
    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => setCurrentTime(Number(e.target.value));
    const handleSeekEnd = async (e: React.MouseEvent<HTMLInputElement>) => {
        const newTime = Number((e.currentTarget as HTMLInputElement).value);
        setIsDragging(false);
        await audioService.seek(newTime);
        setCurrentTime(newTime);
    };
    const progressPercent = metadata && metadata.duration > 0 ? (currentTime / metadata.duration) * 100 : 0;

    return (
        <div className="w-[40%] shrink-0 flex flex-col items-center gap-1">
            <div className="flex items-center gap-6">

                {/* 随机按钮 */}
                <CustomTooltip text={"随机播放"}>
                    <button
                        onClick={handleBtnShuffle}
                        className={clsx(
                            "text-xl transition-colors p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10",
                            isShuffling
                                ? "text-primary"
                                : "text-neutral-400 dark:text-neutral-500"
                        )}
                    >
                        <MdShuffle />
                    </button>
                </CustomTooltip>

                {/* 上一首 */}
                <CustomTooltip text="上一首">
                    <button onClick={handlePrev} className="text-2xl text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white p-1">
                        <MdSkipPrevious />
                    </button>
                </CustomTooltip>

                {/* 播放/暂停 */}
                <CustomTooltip text={!metadata ? "没有歌曲" : (isPlaying ? "暂停" : "播放")}>
                    <button
                        onClick={metadata ? togglePlay : undefined}
                        disabled={!metadata}
                        className={clsx(
                            "text-5xl transition-transform drop-shadow-md",
                            metadata
                                ? "text-primary hover:scale-105 active:scale-95 cursor-pointer"
                                : "text-neutral-300 dark:text-neutral-600 cursor-not-allowed"
                        )}
                    >
                        {isPlaying ? <MdPauseCircle /> : <MdPlayCircle />}
                    </button>
                </CustomTooltip>

                {/* 下一首 */}
                <CustomTooltip text="下一首">
                    <button onClick={handleNext} className="text-2xl text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white p-1">
                        <MdSkipNext />
                    </button>
                </CustomTooltip>

                {/* 循环按钮 */}
                <CustomTooltip text={
                    repeatMode === 'off' ? "重复播放已关闭" :
                        repeatMode === 'all' ? "重复播放全部" : "单曲循环"
                }>
                    <button
                        onClick={handleBtnRepeat}
                        className={clsx(
                            "text-xl transition-colors relative p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10",
                            repeatMode !== 'off'
                                ? "text-primary"
                                : "text-neutral-400 dark:text-neutral-500"
                        )}
                    >
                        <MdRepeat />
                        {repeatMode === 'one' && (
                            <span className="absolute top-1.5 right-1.5 text-[8px] font-bold leading-none">1</span>
                        )}
                    </button>
                </CustomTooltip>
            </div>

            {/* 进度条 */}
            <div className="w-full max-w-lg flex items-center gap-3 text-xs text-neutral-500 font-medium">
                <span className="w-8 text-right tabular-nums">{formatTime(currentTime)}</span>
                <div className="flex-1 relative h-4 group flex items-center">
                    <div className="absolute left-0 right-0 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden pointer-events-none transition-all group-hover:h-1.5"></div>
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full pointer-events-none transition-all group-hover:h-1.5" style={{ width: `${progressPercent}%` }} />
                    <div
                        className={clsx(
                            "absolute top-1/2 -mt-1.5 h-3 w-3 rounded-full bg-primary opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100",
                            isDragging && "opacity-100 scale-125"
                        )}
                        style={{ left: `${progressPercent}%`, marginLeft: '-6px' }}
                    />
                    {/* 只有在有歌曲时才允许拖动进度条 */}
                    {metadata && (
                        <input type="range" min="0" max={metadata?.duration || 100} value={currentTime} onMouseDown={handleSeekStart} onChange={handleSeekChange} onMouseUp={handleSeekEnd} className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer" />
                    )}
                </div>
                <span className="w-8 tabular-nums">{formatTime(metadata?.duration || 0)}</span>
            </div>
        </div>
    );
}
