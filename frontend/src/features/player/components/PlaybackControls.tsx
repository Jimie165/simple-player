import { useState, useEffect, useRef } from 'react';
import {
    IoPlayCircle, IoPauseCircle, IoPlaySkipBack, IoPlaySkipForward,
} from 'react-icons/io5';
import { MdShuffle, MdRepeat } from 'react-icons/md';
import clsx from 'clsx';
import { listen } from '@tauri-apps/api/event';
// Store & Services
import { usePlayerStore } from '../../../store/usePlayerStore';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { audioService } from '../../../services/audioService';
import { formatTime } from '../../../utils/time';
// Components
import CustomTooltip from '../../../components/common/CustomTooltip';

export default function PlaybackControls() {
    const {
        isPlaying, metadata,
        isShuffling, repeatMode,
        togglePlay, setIsPlaying,
        toggleShuffle, toggleRepeat,
        setMetadata,
        restartTrigger // Destructure trigger
    } = usePlayerStore();

    const { playlist, currentSongIndex, getNextIndex, setCurrentSongIndex, pushHistory, popHistory, toggleShuffleList } = useLibraryStore();

    const [currentTime, setCurrentTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

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

        // 1. 【修复关键点】无论是不是切新歌，强制先把进度条归零
        setCurrentTime(0);

        // 更新索引
        setCurrentSongIndex(index);

        try {
            setMetadata(song);

            // 调用后端播放
            await audioService.play(song.path, song);

            // 根据 autoPlay 参数决定是继续播放还是立即暂停
            if (autoPlay) {
                setIsPlaying(true);
            } else {
                await audioService.pause();
                setIsPlaying(false);
            }

        } catch (err) {
            console.error("Play failed", err);
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

        // 逻辑：手动点击下一首，即使是单曲循环，也切到下一首
        const len = playlist.length;
        // 使用简单的取模计算下一首，确保能跳出单曲循环
        const nextIdx = (currentSongIndex + 1) % len;

        playSongByIndex(nextIdx);
    };

    // --- 按钮逻辑：上一首 ---
    const handlePrev = async () => {
        // 3秒规则
        if (currentTime > 3) {
            await audioService.seek(0);
            setCurrentTime(0);
            return;
        }

        const historyIndex = popHistory();
        if (historyIndex !== undefined) {
            playSongByIndex(historyIndex);
        } else {
            const len = playlist.length;
            if (len === 0) return;
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
        toggleShuffleList(!isShuffling);
    };

    const handleBtnRepeat = () => {
        // Current: off -> all -> one -> off
        // We need to know NEXT mode to apply side effects
        let nextMode = 'off';
        if (repeatMode === 'off') nextMode = 'all';
        else if (repeatMode === 'all') nextMode = 'one';

        // Apply side effects BEFORE state update to ensure clean render ?? 
        // Or after? 
        // Logic from store:
        // 'all' -> 'one': isShuffling becomes false in Store.
        // We also need to sync Library Store.

        if (repeatMode === 'all') { // Transitioning to 'one'
            // Disable shuffle LIST in library
            toggleShuffleList(false);
        }

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

        const setupListeners = async () => {
            unlistenNext = await listen('smtc:next', () => {
                handleNextRef.current();
            });
            unlistenPrev = await listen('smtc:previous', () => {
                handlePrevRef.current();
            });
            // --- 核心修复：监听后端发送的播放结束事件 ---
            unlistenEnded = await listen('audio:ended', () => {
                console.log("Audio ended event received from backend.");
                handleSongEndedRef.current();
            });
        };

        setupListeners();

        return () => {
            // Safely unlisten (Handle Promise rejection properly for Tauri events)
            const safeUnlisten = (fn: (() => void) | undefined) => {
                if (fn) {
                    try {
                        const result = fn() as any;
                        // If it returns a promise (Tauri V2), catch it.
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
        };
    }, [currentSongIndex, repeatMode, playlist]); // 依赖项要完整，确保闭包能拿到最新状态

    // --- 自动播放监听 ---
    // --- 进度条更新与兜底检测 ---
    useEffect(() => {
        let interval: number;

        if (isPlaying && !isDragging) {
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
    }, [isPlaying, isDragging, metadata, repeatMode, playlist, currentSongIndex]);

    // Metadata 变化时的兜底重置 (比如从 Library 切歌)
    useEffect(() => {
        setCurrentTime(0);
        // 这里也加一道解锁保险
        isAutoChanging.current = false;
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
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-neutral-400 dark:text-neutral-500"
                        )}
                    >
                        <MdShuffle />
                    </button>
                </CustomTooltip>

                {/* 上一首 */}
                <CustomTooltip text="上一首">
                    <button onClick={handlePrev} className="text-2xl text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white p-1">
                        <IoPlaySkipBack />
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
                                ? "text-blue-600 hover:scale-105 active:scale-95 cursor-pointer"
                                : "text-neutral-300 dark:text-neutral-600 cursor-not-allowed"
                        )}
                    >
                        {isPlaying ? <IoPauseCircle /> : <IoPlayCircle />}
                    </button>
                </CustomTooltip>

                {/* 下一首 */}
                <CustomTooltip text="下一首">
                    <button onClick={handleNext} className="text-2xl text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white p-1">
                        <IoPlaySkipForward />
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
                                ? "text-blue-600 dark:text-blue-400"
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
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-600 rounded-full pointer-events-none transition-all group-hover:h-1.5" style={{ width: `${progressPercent}%` }} />
                    <div className="absolute top-1/2 -ml-1.5 h-3 w-3 bg-blue-600 rounded-full shadow-sm pointer-events-none transition-transform group-hover:scale-125 -translate-y-1/2" style={{ left: `${progressPercent}%` }} />
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