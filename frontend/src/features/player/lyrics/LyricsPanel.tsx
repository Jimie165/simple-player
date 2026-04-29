import { useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { LyricsLine } from '@/types';
import { useLyricsSync } from '@/hooks/useLyricsSync';

interface LyricsPanelProps {
    isOpen: boolean;
    lyrics: LyricsLine[] | null;
    status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    hasTimestamps: boolean;
    currentTime: number;
    onSeek: (time: number) => void;
}

export default function LyricsPanel({
    isOpen,
    lyrics,
    status,
    hasTimestamps,
    currentTime,
    onSeek,
}: LyricsPanelProps) {
    const lines = lyrics ?? [];
    const currentIndex = useLyricsSync({
        lyrics: lines,
        currentTime,
        enabled: isOpen,
        hasTimestamps,
    });
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);

    useEffect(() => {
        if (!isOpen || !hasTimestamps || lines.length === 0) return;
        virtuosoRef.current?.scrollToIndex({
            index: currentIndex,
            align: 'center',
            behavior: 'smooth',
        });
    }, [isOpen, hasTimestamps, lines.length, currentIndex]);

    const displayState = useMemo(() => {
        if (status === 'loading') return '正在加载歌词...';
        if (status === 'error') return '歌词读取失败';
        if (status === 'empty') return '此歌曲无歌词';
        if (!lines.length) return '暂无歌词';
        return null;
    }, [status, lines.length]);

    return (
        <div className="relative h-full w-full rounded-[22px] overflow-hidden">
            {/* Background layer decoupled to avoid backdrop-blur overflow clipping bugs */}
            <div className="absolute inset-0 bg-white/5 border border-white/10 shadow-2xl backdrop-blur-xl translate-z-0"></div>

            <div className="relative z-10 px-[clamp(1.2rem,2vw,1.8rem)] pt-[clamp(1.1rem,1.8vw,1.6rem)] pb-3">
                <div className="text-white/80 text-[clamp(0.8rem,1.4vmin,1rem)] font-semibold tracking-[0.2em]">LYRICS</div>
            </div>

            <div className="relative z-10 h-[calc(100%-4.5rem)]">
                {displayState ? (
                    <div className="h-full flex items-center justify-center text-white/40 text-sm">
                        {displayState}
                    </div>
                ) : (
                    <Virtuoso
                        ref={virtuosoRef}
                        className="h-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                        data={lines}
                        itemContent={(index, line) => {
                            const isActive = hasTimestamps && index === currentIndex;
                            const canSeek = line.time_ms !== null;

                            return (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!canSeek) return;
                                        onSeek(line.time_ms! / 1000);
                                    }}
                                    disabled={!canSeek}
                                    className={clsx(
                                        'w-full text-left px-[clamp(1.2rem,2.2vw,2rem)] py-[clamp(0.6rem,1vw,1rem)] transition-all duration-300 origin-left',
                                        canSeek ? 'cursor-pointer' : 'cursor-default',
                                        isActive
                                            ? 'text-white scale-100 opacity-100 drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]'
                                            : 'text-white/60 scale-[0.9] blur-[1px] opacity-40 hover:opacity-75 hover:blur-none'
                                    )}
                                >
                                    <span className="block font-bold text-[clamp(1.15rem,3.2vmin,2.2rem)] leading-[1.4] tracking-wide relative">
                                        {line.text}
                                    </span>
                                </button>
                            );
                        }}
                    />
                )}
            </div>
        </div>
    );
}
