import React, { useState } from 'react';
import clsx from 'clsx';
import { usePlayerStore } from '@/store/usePlayerStore';
import { audioService } from '@/services/audioService';

interface VolumePopupProps {
    show: boolean;
    onChange?: (volume: number) => void;
}

export default function VolumePopup({ show, onChange }: VolumePopupProps) {
    // 从 Store 获取和设置音量
    const { volume, setVolume } = usePlayerStore();
    const [localVolume, setLocalVolume] = useState(volume);
    const [isDragging, setIsDragging] = useState(false);

    const displayVolume = isDragging ? localVolume : volume;

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsDragging(true);
        const val = Number(e.target.value);
        setLocalVolume(val);
        // 拖动时直接改变应用内底层音频服务的音量（范围是 0 - 1），避免卡顿的同时给予实时听觉反馈
        audioService.setVolume(val / 100);
        // 如果外部监听了拖拽变动，将实时值传递出去
        onChange?.(val);
    };

    const handleVolumeCommit = () => {
        setIsDragging(false);
        setVolume(localVolume);
    };

    return (
        <div className={clsx(
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-3 rounded-xl shadow-xl border",
            "bg-white dark:bg-[#2d2d2d] border-neutral-100 dark:border-neutral-700",
            "transition-all duration-200 origin-bottom",
            show ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
        )}>
            <div className="flex items-center gap-3 w-32">
                {/* 自定义进度条 UI */}
                <div className="flex-1 relative h-4 group flex items-center">
                    {/* 轨道背景 */}
                    <div className="absolute left-0 right-0 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden pointer-events-none transition-[height] group-hover:h-1.5"></div>
                    {/* 进度填充 */}
                    <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full pointer-events-none transition-[height] group-hover:h-1.5"
                        style={{ width: `${displayVolume}%` }}
                    />
                    {/* 圆点 (Thumb) */}
                    <div
                        className={clsx(
                            "absolute top-1/2 -mt-1.5 h-3 w-3 rounded-full bg-primary opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100",
                            isDragging && "opacity-100 scale-125"
                        )}
                        style={{ left: `${displayVolume}%`, marginLeft: '-6px' }}
                    />
                    {/* 透明的可交互滑块 */}
                    <input
                        type="range"
                        min="0" max="100"
                        value={displayVolume}
                        onMouseDown={() => setIsDragging(true)}
                        onTouchStart={() => setIsDragging(true)}
                        onChange={handleVolumeChange}
                        onMouseUp={handleVolumeCommit}
                        onTouchEnd={handleVolumeCommit}
                        className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer"
                    />
                </div>
                <span className="text-xs font-medium w-6 text-right tabular-nums text-neutral-900 dark:text-neutral-100">
                    {displayVolume}
                </span>
            </div>
            {/* 底部的小三角箭头 */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-8 border-transparent border-t-white dark:border-t-[#2d2d2d]" />
        </div>
    );
}
