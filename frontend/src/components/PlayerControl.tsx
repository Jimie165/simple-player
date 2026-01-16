import { useState } from 'react';
import {
    IoPlaySkipBack, IoPlaySkipForward, IoPlayCircle, IoPauseCircle,
    IoShuffle, IoRepeat, IoVolumeMedium
} from 'react-icons/io5';

export default function PlayerControl() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(70);
    const [progress, setProgress] = useState(30);

    return (
        <div className="flex h-24 w-full flex-col justify-center border-t border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900 z-40">
            <div className="flex items-center justify-between">

                {/* 左侧：歌曲信息 */}
                <div className="flex w-1/4 items-center gap-3">
                    {/* 模拟专辑封面 */}
                    <div className="h-14 w-14 rounded-md bg-neutral-200 shadow-sm dark:bg-neutral-700" />
                    <div className="flex flex-col justify-center overflow-hidden">
                        <div className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            Unknown Track
                        </div>
                        <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                            Unknown Artist
                        </div>
                    </div>
                </div>

                {/* 中间：播放控制 */}
                <div className="flex w-2/4 flex-col items-center gap-2">
                    {/* 按钮组 */}
                    <div className="flex items-center gap-6">
                        <button className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                            <IoShuffle className="text-xl" />
                        </button>
                        <button className="text-neutral-800 hover:text-blue-600 dark:text-neutral-200 dark:hover:text-blue-400 transition-colors">
                            <IoPlaySkipBack className="text-2xl" />
                        </button>

                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="text-5xl text-blue-600 hover:scale-105 active:scale-95 transition-transform drop-shadow-md"
                        >
                            {isPlaying ? <IoPauseCircle /> : <IoPlayCircle />}
                        </button>

                        <button className="text-neutral-800 hover:text-blue-600 dark:text-neutral-200 dark:hover:text-blue-400 transition-colors">
                            <IoPlaySkipForward className="text-2xl" />
                        </button>
                        <button className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                            <IoRepeat className="text-xl" />
                        </button>
                    </div>

                    {/* 进度条 */}
                    <div className="flex w-full max-w-md items-center gap-2 text-xs text-neutral-500 font-mono">
                        <span>1:20</span>
                        <input
                            type="range"
                            min="0" max="100"
                            value={progress}
                            onChange={(e) => setProgress(Number(e.target.value))}
                            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-200 accent-blue-600 hover:accent-blue-500 dark:bg-neutral-700"
                        />
                        <span>3:45</span>
                    </div>
                </div>

                {/* 右侧：音量与功能 */}
                <div className="flex w-1/4 justify-end items-center gap-4">
                    <div className="flex items-center gap-2">
                        <IoVolumeMedium className="text-xl text-neutral-500" />
                        <input
                            type="range"
                            min="0" max="100"
                            value={volume}
                            onChange={(e) => setVolume(Number(e.target.value))}
                            className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-500 hover:accent-neutral-700 dark:bg-neutral-700 dark:accent-neutral-400"
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}