import type React from 'react';
import clsx from 'clsx';
import { formatTime } from '@/utils/time';
import type { SongMetadata } from '@/types';

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
    mode,
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
    return (
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
                {metadata && (
                    <input type="range" min="0" max={metadata?.duration || 100} value={currentTime} onMouseDown={handleSeekStart} onChange={handleSeekChange} onMouseUp={handleSeekEnd} className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer" />
                )}
            </div>
        </div>
    );
}
