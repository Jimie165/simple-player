import clsx from 'clsx';
import type { LyricsLine } from '@/types';
import { interludeGapOpenDurationMs } from '@/features/player/lyrics/constants';
import KaraokeText from '@/features/player/lyrics/KaraokeText';

interface LyricsLineItemProps {
    line: LyricsLine;
    isActive: boolean;
    isUserScrolling: boolean;
    pausedScroll: boolean;
    distanceFromActive: number;
    interludeShift: number;
    lineEndMs: number | null;
    currentTime: number;
    onSeek: (time: number) => void;
}

export default function LyricsLineItem({
    line,
    isActive,
    isUserScrolling,
    pausedScroll,
    distanceFromActive,
    interludeShift,
    lineEndMs,
    currentTime,
    onSeek,
}: LyricsLineItemProps) {
    const blurPx = Math.min(2.8, 0.35 + distanceFromActive * 0.55);
    const rowOpacity = Math.max(
        0.22,
        distanceFromActive === 0 ? 1 : 0.82 - distanceFromActive * 0.12
    );
    const rowFilter = isUserScrolling || pausedScroll ? 'none' : `blur(${blurPx}px)`;
    const appliedOpacity = isUserScrolling || pausedScroll ? 1 : rowOpacity;
    const canSeek = line.time_ms !== null;

    return (
        <button
            type="button"
            onClick={() => {
                if (line.time_ms === null) return;
                onSeek(line.time_ms / 1000);
            }}
            disabled={!canSeek}
            style={{
                filter: rowFilter,
                opacity: appliedOpacity,
                transform: `translateY(${interludeShift}px) scale(${isActive ? 1 : 0.9})`,
                transition: `filter 300ms, opacity 300ms, transform ${interludeGapOpenDurationMs}ms cubic-bezier(0.25, 1, 0.5, 1)`,
            }}
            className={clsx(
                'w-full text-left px-[clamp(1.2rem,2.2vw,2rem)] py-[clamp(0.6rem,1vw,1rem)] origin-left will-change-[filter,opacity,transform]',
                canSeek ? 'cursor-pointer' : 'cursor-default',
                isActive ? 'text-white drop-shadow-xl' : 'text-white'
            )}
        >
            <span
                className={clsx(
                    'block font-bold text-[clamp(1.42rem,3.9vmin,2.7rem)] leading-[1.38] tracking-wide relative',
                    isActive ? 'opacity-100' : 'opacity-40 hover:opacity-75'
                )}
            >
                {isActive && line.words && line.words.length > 0 ? (
                    <KaraokeText
                        words={line.words}
                        lineEndMs={lineEndMs}
                        currentMs={currentTime * 1000}
                    />
                ) : (
                    line.text
                )}
            </span>
            {line.translation && (
                <span
                    className={clsx(
                        'block font-medium text-[clamp(1.08rem,2.8vmin,1.92rem)] leading-[1.34] tracking-wide mt-1 transition-all duration-300',
                        isActive
                            ? 'text-white/65 opacity-95 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]'
                            : 'text-white/32 opacity-80'
                    )}
                >
                    {line.translation}
                </span>
            )}
        </button>
    );
}
