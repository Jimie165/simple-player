import clsx from 'clsx';
import LyricsPanel from '@/features/player/lyrics/LyricsPanel';
import type { LyricsLine } from '@/types';

interface ApplePlayerLyricsPanelProps {
    isLyricsOpen: boolean;
    lyricsMounted: boolean;
    lyrics: LyricsLine[] | null;
    lyricsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    hasTimestamps: boolean;
    currentTime: number;
    onSeek: (time: number) => void;
}

export default function ApplePlayerLyricsPanel({
    isLyricsOpen,
    lyricsMounted,
    lyrics,
    lyricsStatus,
    hasTimestamps,
    currentTime,
    onSeek,
}: ApplePlayerLyricsPanelProps) {
    return (
        <div
            className={clsx(
                'flex-1 min-w-0 h-full max-h-[95%] flex flex-col z-30 overflow-hidden justify-center',
                'transition-[max-width,padding-left,padding-right] duration-500 ease-[0.32,0.72,0,1]',
                isLyricsOpen ? 'max-w-full pl-[clamp(1rem,3vw,2.25rem)] pr-[clamp(1rem,3vw,2rem)]' : 'max-w-0 pl-0 pr-0'
            )}
        >
            <div className="relative flex-1 overflow-hidden">
                <div
                    className={clsx(
                        'absolute inset-0',
                        'transition-[opacity,transform] duration-500 ease-[0.32,0.72,0,1]',
                        isLyricsOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-5 pointer-events-none'
                    )}
                >
                    {lyricsMounted && isLyricsOpen && (
                        <LyricsPanel
                            isOpen={isLyricsOpen}
                            lyrics={lyrics}
                            status={lyricsStatus}
                            hasTimestamps={hasTimestamps}
                            currentTime={currentTime}
                            onSeek={onSeek}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
