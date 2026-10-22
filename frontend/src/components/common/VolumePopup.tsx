import React, { useState } from 'react';
import clsx from 'clsx';
import { usePlayerStore } from '@/store/usePlayerStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { useRangePointerDrag } from '@/hooks/useRangePointerDrag';

interface VolumePopupProps {
    show: boolean;
    onChange?: (volume: number) => void;
}

export default function VolumePopup({ show, onChange }: VolumePopupProps) {
    // 从 Store 获取和设置音量
    const volume = usePlayerStore(s => s.volume);
    const { setVolume: commitVolume } = usePlaybackActions();
    const [localVolume, setLocalVolume] = useState(volume);
    const [isDragging, setIsDragging] = useState(false);

    const displayVolume = isDragging ? localVolume : volume;

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsDragging(true);
        const val = Number(e.target.value);
        setLocalVolume(val);
        // 拖动时直接改变应用内底层音频服务的音量（范围是 0 - 1），避免卡顿的同时给予实时听觉反馈
        void commitVolume(val);
        // 如果外部监听了拖拽变动，将实时值传递出去
        onChange?.(val);
    };

    const handleVolumeCommit = (event: React.PointerEvent<HTMLInputElement>) => {
        setIsDragging(false);
        void commitVolume(Number(event.currentTarget.value));
    };

    const pointerDrag = useRangePointerDrag(() => {
        setLocalVolume(volume);
        setIsDragging(true);
    }, handleVolumeCommit);

    // Fade the material and contents separately; the outer backdrop root stays stable.
    return (
        <div className={clsx(
            "content-player-shell isolate absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-3 rounded-xl",
            "before:transition-opacity before:duration-180 after:transition-opacity after:duration-180",
            show
                ? "visible translate-y-0 before:opacity-100 after:opacity-100 [transition:translate_180ms_ease-out,visibility_0s]"
                : "invisible translate-y-2 before:opacity-0 after:opacity-0 pointer-events-none [transition:translate_180ms_ease-in,visibility_0s_180ms]"
        )}>
            <div className={clsx("flex items-center gap-3 w-32 transition-opacity duration-180", show ? "opacity-100" : "opacity-0")}>
                {/* 自定义进度条 UI */}
                <div className="flex-1 relative h-4 group flex items-center">
                    {/* 轨道背景 */}
                    <div className="absolute left-0 right-0 h-1 bg-on-surface/15 rounded-full overflow-hidden pointer-events-none transition-[height] group-hover:h-1.5"></div>
                    {/* 进度填充 */}
                    <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-on-surface/80 rounded-full pointer-events-none transition-[height] group-hover:h-1.5"
                        style={{ width: `${displayVolume}%` }}
                    />
                    {/* 圆点 (Thumb) */}
                    <div
                        className={clsx(
                            "absolute top-1/2 -mt-1.5 h-3 w-3 rounded-full bg-on-surface opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100",
                            isDragging && "opacity-100 scale-125"
                        )}
                        style={{ left: `${displayVolume}%`, marginLeft: '-6px' }}
                    />
                    {/* 透明的可交互滑块 */}
                    <input
                        type="range"
                        min="0" max="100"
                        value={displayVolume}
                        {...pointerDrag}
                        onChange={handleVolumeChange}
                        className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer touch-none"
                    />
                </div>
                <span className="text-xs font-medium w-6 text-right tabular-nums text-on-surface">
                    {displayVolume}
                </span>
            </div>
        </div>
    );
}
