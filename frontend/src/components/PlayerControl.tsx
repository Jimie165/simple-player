import { invoke } from '@tauri-apps/api/core';
import { IoPlayCircle, IoPauseCircle, IoVolumeMedium, IoPlaySkipBack, IoPlaySkipForward, IoShuffle, IoRepeat, IoMusicalNotes } from 'react-icons/io5';
import { useState, useEffect } from 'react';
import type { SongMetadata } from '../types';

interface PlayerControlProps {
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    metadata: SongMetadata | null;
}

const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function PlayerControl({ isPlaying, setIsPlaying, metadata }: PlayerControlProps) {
    const [volume, setVolume] = useState(70);
    const [currentTime, setCurrentTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // 进度条计时器
    useEffect(() => {
        let interval: number;

        if (isPlaying && !isDragging) {
            interval = window.setInterval(() => {
                setCurrentTime((prev) => {
                    if (metadata && prev >= metadata.duration) {
                        setIsPlaying(false);
                        return 0; // 播放结束归零
                    }
                    return prev + 1;
                });
            }, 1000);
        }

        return () => clearInterval(interval);
    }, [isPlaying, isDragging, metadata, setIsPlaying]);

    // 切歌重置
    useEffect(() => {
        setCurrentTime(0);
    }, [metadata]);

    const togglePlay = async () => {
        if (isPlaying) {
            await invoke('pause_audio');
            setIsPlaying(false);
        } else {
            await invoke('resume_audio');
            setIsPlaying(true);
        }
    };

    const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVol = Number(e.target.value);
        setVolume(newVol);
        await invoke('set_volume', { volume: newVol / 100 });
    };

    // 进度条交互逻辑
    const handleSeekStart = () => setIsDragging(true);

    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCurrentTime(Number(e.target.value));
    };

    const handleSeekEnd = async (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
        const newTime = Number((e.currentTarget as HTMLInputElement).value);
        setIsDragging(false);
        // 调用 Rust seek
        await invoke('seek_audio', { position: newTime });
        setCurrentTime(newTime);
    };

    // 计算进度百分比
    const progressPercent = metadata && metadata.duration > 0
        ? (currentTime / metadata.duration) * 100
        : 0;

    return (
        <div className="flex h-24 w-full flex-col justify-center border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#202020] px-4 z-40 transition-colors">
            <div className="flex items-center justify-between">

                {/* 左侧：歌曲信息 */}
                <div className="flex w-1/4 items-center gap-3 overflow-hidden">
                    <div className="w-14 h-14 rounded-md bg-neutral-200 dark:bg-neutral-700 overflow-hidden shadow-sm shrink-0 relative flex items-center justify-center">
                        {metadata?.cover ? (
                            <img src={metadata.cover} alt="Cover" className="w-full h-full object-cover" />
                        ) : (
                            <IoMusicalNotes className="text-2xl text-neutral-400" />
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate text-neutral-900 dark:text-neutral-100">
                            {metadata?.title || "未播放音乐"}
                        </div>
                        <div className="text-xs text-neutral-500 truncate">
                            {metadata?.artist || "Simple Player"}
                        </div>
                    </div>
                </div>

                {/* 中间：控制 & 进度条 */}
                <div className="flex w-2/4 flex-col items-center gap-1">
                    <div className="flex items-center gap-6">
                        <button className="text-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"><IoShuffle /></button>
                        <button className="text-2xl text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"><IoPlaySkipBack /></button>

                        <button
                            onClick={togglePlay}
                            className="text-5xl text-blue-600 hover:scale-105 active:scale-95 transition-transform drop-shadow-md"
                        >
                            {isPlaying ? <IoPauseCircle /> : <IoPlayCircle />}
                        </button>

                        <button className="text-2xl text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"><IoPlaySkipForward /></button>
                        <button className="text-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"><IoRepeat /></button>
                    </div>

                    {/* --- 完美对齐的进度条 --- */}
                    <div className="w-full max-w-lg flex items-center gap-3 text-xs text-neutral-500 font-medium">
                        <span className="w-8 text-right">{formatTime(currentTime)}</span>

                        {/* 容器：固定高度 h-4 (16px)，用于垂直对齐 */}
                        <div className="flex-1 relative h-4 group flex items-center">

                            {/* 1. 背景轨道 (灰色) */}
                            <div className="absolute left-0 right-0 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden pointer-events-none"></div>

                            {/* 2. 已播放轨道 (蓝色) */}
                            <div
                                className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-600 rounded-full pointer-events-none"
                                style={{ width: `${progressPercent}%` }}
                            />

                            {/* 3. 自定义滑块圆点 (蓝色) - 绝对居中 */}
                            <div
                                className="absolute top-1/2 -ml-1.5 h-3 w-3 bg-blue-600 rounded-full shadow-sm pointer-events-none transition-transform group-hover:scale-125 -translate-y-1/2"
                                style={{ left: `${progressPercent}%` }}
                            />

                            {/* 4. 透明 Input (交互层) - 覆盖整个容器，负责接收拖拽 */}
                            <input
                                type="range"
                                min="0"
                                max={metadata?.duration || 100}
                                value={currentTime}
                                onMouseDown={handleSeekStart}
                                onChange={handleSeekChange}
                                onMouseUp={handleSeekEnd}
                                onTouchStart={handleSeekStart}
                                onTouchEnd={handleSeekEnd}
                                className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>

                        <span className="w-8">{formatTime(metadata?.duration || 0)}</span>
                    </div>
                </div>

                {/* 右侧：音量 */}
                <div className="flex w-1/4 justify-end items-center gap-4">
                    <div className="flex items-center gap-2 group">
                        <IoVolumeMedium className="text-xl text-neutral-500" />
                        <input
                            type="range"
                            min="0" max="100"
                            value={volume}
                            onChange={handleVolumeChange}
                            className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-500 hover:accent-neutral-700 dark:bg-neutral-700 dark:accent-neutral-400"
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}