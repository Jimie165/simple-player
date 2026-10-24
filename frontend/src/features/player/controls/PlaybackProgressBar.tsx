import type React from 'react';
import clsx from 'clsx';
import { formatTime } from '@/utils/time';
import type { SongMetadata } from '@/types';
import { useRangePointerDrag } from '@/hooks/useRangePointerDrag';

interface PlaybackProgressBarProps {
    mode: 'full' | 'compact' | 'mini';
    isMini: boolean;
    metadata: SongMetadata | null;
    currentTime: number;
    displayCurrentTime: number;
    remainingTime: number;
    progressPercent: number;
    isDragging: boolean;
    handleSeekStart: () => void;
    handleSeekChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handleSeekEnd: (event: React.MouseEvent<HTMLInputElement>) => void;
}

export function PlaybackProgressBar({
    isMini,
    metadata,
    currentTime,
    displayCurrentTime,
    remainingTime,
    progressPercent,
    isDragging,
    handleSeekStart,
    handleSeekChange,
    handleSeekEnd,
}: PlaybackProgressBarProps) {
    const pointerDrag = useRangePointerDrag(handleSeekStart, handleSeekEnd);
    return (
        <div className={clsx(
            "player-progress z-20 col-start-2 col-end-3 row-start-1 mb-1 flex self-end text-[10px] font-medium text-neutral-500 dark:text-white/50",
            isMini && "hidden"
        )} data-dragging={isDragging || undefined}>
            <div className="group relative flex h-5 flex-1 items-center">
                <span className="pointer-events-none absolute -top-2.5 left-0 text-xs font-medium tabular-nums leading-none text-neutral-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:text-white/84">
                    {formatTime(displayCurrentTime)}
                </span>
                <span className="pointer-events-none absolute -top-2.5 right-0 text-xs font-medium tabular-nums leading-none text-neutral-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:text-white/84">
                    -{formatTime(remainingTime)}
                </span>
                <div className="pointer-events-none absolute left-0 right-0 h-[3px] overflow-hidden rounded-full bg-black/[0.075] transition-[height] duration-150 group-hover:h-2 group-focus-within:h-2 dark:bg-white/[0.12]"></div>
                <div className="pointer-events-none absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-primary/90 transition-[height] duration-150 group-hover:h-2 group-focus-within:h-2" style={{ width: `${progressPercent}%` }} />
                {metadata && (
                    <input type="range" min="0" max={metadata?.duration || 100} value={currentTime} {...pointerDrag} onChange={handleSeekChange} aria-label="播放进度" className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer touch-none" />
                )}
            </div>
        </div>
    );
}
