import clsx from 'clsx';
import CoverPlaybackIcon from '@/components/common/CoverPlaybackIcon';
import { usePlayerStore } from '@/store/usePlayerStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import type { SongMetadata } from '@/types';
import CoverImage from '@/components/common/CoverImage';
import Equalizer from '@/components/common/Equalizer';

interface SongCoverOverlayProps {
    song: SongMetadata;
    className?: string; // Wrapper size classes (e.g., w-10 h-10)
    coverClassName?: string; // Inner image classes
    onPlay: () => void; // Action to play this song (if not current)
    iconClassName?: string; // Fallback icon color
    isActive?: boolean; // Manual override for current playing status (useful for duplicates in queue)
    trackNumber?: number;
}

export default function SongCoverOverlay({
    song,
    className,
    coverClassName,
    onPlay,
    iconClassName,
    isActive,
    trackNumber,
}: SongCoverOverlayProps) {
    const metadata = usePlayerStore(state => state.metadata);
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const { togglePlayback } = usePlaybackActions();

    // Determine if this is the currently active song
    // Prioritize manual isActive prop, then ID match, fallback to path match
    const isCurrent = isActive !== undefined ? isActive : (
        !!metadata && (
            (song.id !== undefined && metadata.id !== undefined && String(song.id) === String(metadata.id)) ||
            (song.path === metadata.path)
        )
    );

    const handleContainerClick = async (e: React.SyntheticEvent) => {
        e.stopPropagation();
        if (isCurrent) {
            await togglePlayback();
        } else {
            // New song, call parent handler
            onPlay();
        }
    };

    return (
        <div
            className={clsx("relative shrink-0 overflow-hidden group/overlay cursor-pointer", className)}
            role="button"
            tabIndex={0}
            aria-label={`${isCurrent && isPlaying ? '暂停' : '播放'} ${song.title}`}
            onClick={(event) => { void handleContainerClick(event).catch(console.error); }}
            onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                void handleContainerClick(event).catch(console.error);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            {trackNumber === undefined ? <CoverImage
                song={song}
                thumbnail={128}
                className={clsx("w-full h-full object-cover", coverClassName)}
                iconClassName={iconClassName}
            /> : <span className={clsx(
                'absolute inset-0 grid place-items-center text-on-surface-variant tabular-nums group-hover:opacity-0 group-focus-visible/overlay:opacity-0',
                isCurrent && 'opacity-0'
            )}>{trackNumber}</span>}

            {/* Overlay Layer */}
            <div className={clsx(
                "absolute inset-0 flex items-center justify-center transition-colors duration-200 z-10",
                trackNumber !== undefined ? 'bg-transparent' : isCurrent
                    ? "bg-black/50 group-hover:bg-black/30 group-hover/overlay:bg-black/30"
                    : "bg-transparent group-hover:bg-black/30 group-hover/overlay:bg-black/30"
            )}>
                {/* 
                   Render Logic (CSS Driven):
                   1. Is Current:
                      - Hover: Show Play/Pause Icon based on isPlaying.
                      - No Hover: Show Equalizer (Active or Static).
                   2. Not Current:
                      - Hover: Show Play Icon.
                      - No Hover: Show Nothing.
                */}

                {isCurrent ? (
                    <>
                        {/* Current & Hovered: Control Button */}
                        <div className="hidden group-hover:flex group-hover/overlay:flex group-focus-visible/overlay:flex items-center justify-center">
                            <CoverPlaybackIcon playing={isPlaying} className={trackNumber === undefined ? undefined : 'text-on-surface'} />
                        </div>

                        {/* Current & Not Hovered: Indicator */}
                        <div className="flex group-hover:hidden group-hover/overlay:hidden group-focus-visible/overlay:hidden items-center justify-center w-4 h-4">
                            <Equalizer
                                isPlaying={isPlaying}
                                className={trackNumber === undefined ? 'bg-white' : 'bg-on-surface'}
                            />
                        </div>
                    </>
                ) : (
                    /* Not Current: Only show Play icon on hover */
                    <div className="hidden group-hover:flex group-hover/overlay:flex group-focus-visible/overlay:flex items-center justify-center">
                        <CoverPlaybackIcon className={trackNumber === undefined ? undefined : 'text-on-surface'} />
                    </div>
                )}
            </div>
        </div>
    );
}
