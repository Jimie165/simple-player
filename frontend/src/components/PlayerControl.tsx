import { invoke } from '@tauri-apps/api/core';
import {
    IoPlayCircle, IoPauseCircle, IoVolumeMedium, IoVolumeMute,
    IoPlaySkipBack, IoPlaySkipForward, IoShuffle, IoRepeat,
    IoMusicalNotes, IoInformationCircleOutline, IoClose
} from 'react-icons/io5';
import { useState, useEffect, useRef, Fragment } from 'react';
// 修改点 1: 引入 v2 组件 (没有 . 写法了)
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import type { SongMetadata } from '../types';
import clsx from 'clsx';

interface PlayerControlProps {
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    metadata: SongMetadata | null;
    isFullScreen: boolean;
    toggleFullScreen: () => void;
}

const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function PlayerControl({ isPlaying, setIsPlaying, metadata, isFullScreen, toggleFullScreen }: PlayerControlProps) {
    const [volume, setVolume] = useState(70);
    const [currentTime, setCurrentTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const [showVolumePopup, setShowVolumePopup] = useState(false);
    const [isInfoOpen, setIsInfoOpen] = useState(false);
    const volumeRef = useRef<HTMLDivElement>(null);

    // ... (中间的 useEffect, togglePlay, volume, seek 逻辑完全保持不变，省略以节省篇幅) ...
    // 请保留你原有的 handleClickOutside, 进度条逻辑, handleVolumeChange 等函数
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (volumeRef.current && !volumeRef.current.contains(event.target as Node)) {
                setShowVolumePopup(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        let interval: number;
        if (isPlaying && !isDragging) {
            interval = window.setInterval(() => {
                setCurrentTime((prev) => {
                    if (metadata && prev >= metadata.duration) {
                        setIsPlaying(false);
                        return 0;
                    }
                    return prev + 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, isDragging, metadata, setIsPlaying]);

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

    const handleSeekStart = () => setIsDragging(true);
    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => setCurrentTime(Number(e.target.value));
    const handleSeekEnd = async (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
        const newTime = Number((e.currentTarget as HTMLInputElement).value);
        setIsDragging(false);
        await invoke('seek_audio', { position: newTime });
        setCurrentTime(newTime);
    };

    const progressPercent = metadata && metadata.duration > 0 ? (currentTime / metadata.duration) * 100 : 0;

    return (
        <>
            <div className={clsx(
                "flex h-24 w-full flex-col justify-center border-t px-4 z-50 transition-colors duration-300",
                "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#202020]"
            )}>
                {/* 修改点 1: 添加 gap-4，确保各区域之间有最小间距 */}
                <div className="flex items-center justify-between gap-4">

                    {/* 左侧：从 w-1/4 改为 w-[30%]，并添加 min-w-0 防止 flex 子项溢出问题 */}
                    <div className="w-[30%] min-w-0 flex justify-start">
                        <button
                            onClick={toggleFullScreen}
                            // 保持之前的 w-auto max-w-full 逻辑
                            className="group flex items-center text-left rounded-lg p-2 -ml-2 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors relative overflow-visible w-auto max-w-full"
                        >
                            {/* 小封面容器 */}
                            <div className={clsx(
                                "relative shrink-0 flex items-center justify-center bg-neutral-200 dark:bg-neutral-700 overflow-hidden shadow-sm",
                                "transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
                                isFullScreen
                                    ? "w-0 h-14 opacity-0 -translate-y-12 scale-150 mr-0"
                                    : "w-14 h-14 opacity-100 translate-y-0 scale-100 mr-4 rounded-md"
                            )}>
                                {metadata?.cover ? (
                                    <img src={metadata.cover} alt="Cover" className="w-full h-full object-cover" />
                                ) : (
                                    <IoMusicalNotes className="text-2xl text-neutral-400" />
                                )}
                            </div>

                            {/* 文字信息 */}
                            <div className="min-w-0 flex-1 flex flex-col justify-center transition-all duration-500 pr-4">
                                <div className="font-semibold text-sm truncate text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors w-full">
                                    {metadata?.title || "未播放音乐"}
                                </div>
                                <div className="text-xs text-neutral-500 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors truncate w-full mt-0.5">
                                    {metadata?.artist || "Simple Player"}
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* 中间：从 w-2/4 改为 w-[40%]，收紧中间区域 */}
                    <div className="w-[40%] shrink-0 flex flex-col items-center gap-1">
                        {/* ... 播放按钮和进度条代码保持不变 ... */}
                        <div className="flex items-center gap-6">
                            <button className="text-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"><IoShuffle /></button>
                            <button className="text-2xl text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"><IoPlaySkipBack /></button>
                            <button onClick={togglePlay} className="text-5xl text-blue-600 hover:scale-105 active:scale-95 transition-transform drop-shadow-md">
                                {isPlaying ? <IoPauseCircle /> : <IoPlayCircle />}
                            </button>
                            <button className="text-2xl text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"><IoPlaySkipForward /></button>
                            <button className="text-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"><IoRepeat /></button>
                        </div>
                        <div className="w-full max-w-lg flex items-center gap-3 text-xs text-neutral-500 font-medium">
                            <span className="w-8 text-right">{formatTime(currentTime)}</span>
                            <div className="flex-1 relative h-4 group flex items-center">
                                <div className="absolute left-0 right-0 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden pointer-events-none"></div>
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-600 rounded-full pointer-events-none" style={{ width: `${progressPercent}%` }} />
                                <div className="absolute top-1/2 -ml-1.5 h-3 w-3 bg-blue-600 rounded-full shadow-sm pointer-events-none transition-transform group-hover:scale-125 -translate-y-1/2" style={{ left: `${progressPercent}%` }} />
                                <input type="range" min="0" max={metadata?.duration || 100} value={currentTime} onMouseDown={handleSeekStart} onChange={handleSeekChange} onMouseUp={handleSeekEnd} onTouchStart={handleSeekStart} onTouchEnd={handleSeekEnd} className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer" />
                            </div>
                            <span className="w-8">{formatTime(metadata?.duration || 0)}</span>
                        </div>
                    </div>

                    {/* 右侧：从 w-1/4 改为 w-[30%]，保持对称 */}
                    <div className="w-[30%] min-w-0 flex justify-end items-center gap-2">
                        {/* ... 音量和属性按钮代码保持不变 ... */}
                        <div className="relative" ref={volumeRef}>
                            <div className={clsx(
                                "absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-3 rounded-xl shadow-xl border",
                                "bg-white dark:bg-[#2d2d2d] border-neutral-100 dark:border-neutral-700",
                                "transition-all duration-200 origin-bottom",
                                showVolumePopup ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
                            )}>
                                <div className="flex items-center gap-3 w-32">
                                    <input type="range" min="0" max="100" value={volume} onChange={handleVolumeChange} className="h-1 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-500 hover:accent-neutral-700 dark:bg-neutral-600 dark:accent-neutral-400" />
                                    <span className="text-xs font-medium w-6 text-right tabular-nums">{volume}</span>
                                </div>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-8 border-transparent border-t-white dark:border-t-[#2d2d2d]" />
                            </div>
                            <button
                                onClick={() => setShowVolumePopup(!showVolumePopup)}
                                className={clsx(
                                    "p-2 rounded-lg transition-colors",
                                    showVolumePopup ? "bg-neutral-100 text-blue-600 dark:bg-white/10 dark:text-blue-400" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
                                )}
                            >
                                {volume === 0 ? <IoVolumeMute className="text-xl" /> : <IoVolumeMedium className="text-xl" />}
                            </button>
                        </div>
                        <button
                            onClick={() => setIsInfoOpen(true)}
                            className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200 transition-colors"
                        >
                            <IoInformationCircleOutline className="text-xl" />
                        </button>
                    </div>
                </div>
            </div>

            {/* 属性详情弹窗 (Headless UI v2) */}
            <Transition appear show={isInfoOpen} as={Fragment}>
                <Dialog as="div" className="relative z-[999]" onClose={() => setIsInfoOpen(false)}>
                    {/* 遮罩层 */}
                    <TransitionChild
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
                    </TransitionChild>

                    {/* 弹窗定位与内容 */}
                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4 text-center">
                            <TransitionChild
                                as={Fragment}
                                enter="ease-out duration-300"
                                enterFrom="opacity-0 scale-95"
                                enterTo="opacity-100 scale-100"
                                leave="ease-in duration-200"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                {/* 修改点 2: DialogPanel 配置 
                    w-auto: 宽度随内容自动调整
                    min-w-[300px]: 最小宽度，防止太窄
                    max-w-[90vw]: 最大宽度，防止溢出屏幕
                    transition-all: 确保尺寸变化时平滑过渡
                */}
                                <DialogPanel className="w-auto min-w-[320px] max-w-[90vw] transform overflow-hidden rounded-2xl bg-white dark:bg-[#2c2c2c] p-6 text-left align-middle shadow-xl transition-all border border-neutral-200 dark:border-neutral-700">

                                    {/* 标题栏 */}
                                    <div className="flex justify-between items-center mb-4 gap-4">
                                        <DialogTitle as="h3" className="text-lg font-medium leading-6 text-neutral-900 dark:text-white whitespace-nowrap">
                                            属性
                                        </DialogTitle>
                                        <button onClick={() => setIsInfoOpen(false)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                                            <IoClose className="text-xl" />
                                        </button>
                                    </div>

                                    {/* 内容区域：网格布局让 Label 固定宽度，Value 自适应撑开容器 */}
                                    <div className="mt-2 space-y-4">
                                        {/* 封面预览 */}
                                        <div className="flex justify-center mb-4">
                                            <div className="w-32 h-32 rounded-lg bg-neutral-100 dark:bg-neutral-800 overflow-hidden shadow-inner shrink-0">
                                                {metadata?.cover ? (
                                                    <img src={metadata.cover} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                                        <IoMusicalNotes className="text-4xl" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* 属性列表 */}
                                        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm whitespace-nowrap">
                                            <div className="text-neutral-500 dark:text-neutral-400 text-right">标题</div>
                                            <div className="font-medium text-neutral-900 dark:text-neutral-100 select-text">{metadata?.title || "未知"}</div>

                                            <div className="text-neutral-500 dark:text-neutral-400 text-right">艺人</div>
                                            <div className="font-medium text-neutral-900 dark:text-neutral-100 select-text">{metadata?.artist || "未知"}</div>

                                            <div className="text-neutral-500 dark:text-neutral-400 text-right">专辑</div>
                                            <div className="font-medium text-neutral-900 dark:text-neutral-100 select-text">{metadata?.album || "未知"}</div>

                                            <div className="text-neutral-500 dark:text-neutral-400 text-right">时长</div>
                                            <div className="font-medium text-neutral-900 dark:text-neutral-100">{formatTime(metadata?.duration || 0)}</div>
                                        </div>
                                    </div>

                                    <div className="mt-6 flex justify-end">
                                        <button
                                            type="button"
                                            className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
                                            onClick={() => setIsInfoOpen(false)}
                                        >
                                            关闭
                                        </button>
                                    </div>
                                </DialogPanel>
                            </TransitionChild>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </>
    );
}