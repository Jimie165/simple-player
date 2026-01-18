import { useState, useEffect, useRef } from 'react';
import {
    IoPlayCircle, IoPauseCircle, IoPlaySkipBack, IoPlaySkipForward,
    IoShuffle, IoRepeat
} from 'react-icons/io5';
import clsx from 'clsx';
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
        setMetadata
    } = usePlayerStore();

    const { playlist, currentSongIndex, getNextIndex, setCurrentSongIndex, pushHistory, popHistory, toggleShuffleList, addToRecent } = useLibraryStore();

    const [currentTime, setCurrentTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // 防抖锁：防止自动播放时连续跳过
    const isAutoChanging = useRef(false);

    // --- 核心修复：切歌/播放执行函数 ---
    const playSongByIndex = async (index: number, autoPlay: boolean = true) => {
        if (index < 0 || index >= playlist.length) return;
        const song = playlist[index];
        if (!song.path) return;

        // 1. 【修复关键点】无论是不是切新歌，强制先把进度条归零
        // 这样避免了"单曲循环时 metadata 没变导致 useEffect 不触发重置"的问题
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
                // 如果不需要自动播放（例如列表结束回到第一首）
                // 我们调用 pause 让后端停止，但此时后端已经加载了第一首的资源
                await audioService.pause();
                setIsPlaying(false);
            }

        } catch (err) {
            console.error("Play failed", err);
        } finally {
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

    const handleBtnShuffle = () => {
        toggleShuffle();
        toggleShuffleList(!isShuffling);
    };

    const handleBtnRepeat = () => {
        toggleRepeat();
    };

    // --- 监听 Metadata 变化，添加到最近播放 ---
    useEffect(() => {
        // 只有当 metadata 存在且有有效路径时才记录
        if (metadata && metadata.path) {
            addToRecent({
                id: metadata.path,
                type: 'file', // 标记为单曲文件
                title: metadata.title || 'Unknown',
                description: metadata.artist || 'Unknown Artist',
                cover: metadata.cover || null,
                path: metadata.path,
                lastPlayed: Date.now()
            });
        }
        // 依赖项：当 metadata 引用变化(切歌)时触发
        // 注意：如果只是暂停/播放，metadata 对象引用通常不变，不会重复触发
    }, [metadata, addToRecent]);

    // 监听 repeatMode 变化，同步物理列表
    useEffect(() => {
        if (repeatMode === 'one' && isShuffling === false) {
            toggleShuffleList(false);
        }
    }, [repeatMode]);

    // --- 自动播放监听 ---
    useEffect(() => {
        let interval: number;

        if (isPlaying && !isDragging) {
            interval = window.setInterval(() => {
                setCurrentTime((prev) => {
                    // 检测歌曲结束 (留 0.5s buffer)
                    if (metadata && metadata.duration > 0 && prev >= metadata.duration - 0.5) {

                        // 检查锁
                        if (isAutoChanging.current) return prev;

                        // 上锁
                        isAutoChanging.current = true;

                        if (repeatMode === 'one') {
                            // 单曲循环：重播当前 (调用 playSongByIndex 会处理重置时间和解锁)
                            playSongByIndex(currentSongIndex);
                        } else {
                            // 列表播放：切下一首
                            pushHistory(currentSongIndex);
                            const nextIdx = getNextIndex(repeatMode);

                            if (nextIdx === -1) {
                                console.log("Playlist ended, returning to start.");
                                // 1. 回到列表第一首 (Index 0)
                                // 2. 传入 false，表示不自动播放，而是暂停
                                playSongByIndex(0, false);
                                return 0;
                            }

                            playSongByIndex(nextIdx);
                        }

                        return 0;
                    }
                    return prev + 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, isDragging, metadata, repeatMode, playlist, currentSongIndex]);

    // Metadata 变化时的兜底重置 (比如从 Library 切歌)
    useEffect(() => {
        setCurrentTime(0);
        // 这里也加一道解锁保险
        isAutoChanging.current = false;
    }, [metadata]);

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
                        <IoShuffle />
                    </button>
                </CustomTooltip>

                {/* 上一首 */}
                <CustomTooltip text="上一首">
                    <button onClick={handlePrev} className="text-2xl text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white p-1">
                        <IoPlaySkipBack />
                    </button>
                </CustomTooltip>

                {/* 播放/暂停 */}
                <CustomTooltip text={isPlaying ? "暂停" : "播放"}>
                    <button onClick={togglePlay} className="text-5xl text-blue-600 hover:scale-105 active:scale-95 transition-transform drop-shadow-md">
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
                        <IoRepeat />
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
                    <input type="range" min="0" max={metadata?.duration || 100} value={currentTime} onMouseDown={handleSeekStart} onChange={handleSeekChange} onMouseUp={handleSeekEnd} className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer" />
                </div>
                <span className="w-8 tabular-nums">{formatTime(metadata?.duration || 0)}</span>
            </div>
        </div>
    );
}