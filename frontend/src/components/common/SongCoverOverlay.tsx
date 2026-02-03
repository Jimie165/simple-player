import clsx from 'clsx';
import { MdPlayArrow, MdPause } from 'react-icons/md';
import { usePlayerStore } from '@/store/usePlayerStore';
import { audioService } from '@/services/audioService';
import type { SongMetadata } from '@/types';
import CoverImage from './CoverImage';
import Equalizer from './Equalizer';

interface SongCoverOverlayProps {
    song: SongMetadata;
    className?: string; // Wrapper size classes (e.g., w-10 h-10)
    coverClassName?: string; // Inner image classes
    onPlay: () => void; // Action to play this song (if not current)
    iconClassName?: string; // Fallback icon color
    isActive?: boolean; // Manual override for current playing status (useful for duplicates in queue)
    restartOnPlay?: boolean; // If true, clicking current song restarts instead of toggling pause
}

export default function SongCoverOverlay({
    song,
    className,
    coverClassName,
    onPlay,
    iconClassName,
    isActive,
    restartOnPlay = false
}: SongCoverOverlayProps) {
    const { metadata, isPlaying, togglePlay, setIsPlaying } = usePlayerStore();

    // Determine if this is the currently active song
    // Prioritize manual isActive prop, then ID match, fallback to path match
    const isCurrent = isActive !== undefined ? isActive : (
        !!metadata && (
            (song.id !== undefined && metadata.id !== undefined && String(song.id) === String(metadata.id)) ||
            (song.path === metadata.path)
        )
    );

    const handleContainerClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCurrent) {
            if (restartOnPlay && song.path) {
                try {
                    await audioService.seek(0);
                    await audioService.play(song.path, song);
                    setIsPlaying(true);
                } catch (error) {
                    console.error('Restart play failed', error);
                }
            } else {
                // If it's already the current song, just toggle play/pause
                // This prevents the "restart from beginning" issue caused by parent's onPlay handling
                togglePlay();
            }
        } else {
            // New song, call parent handler
            onPlay();
        }
    };

    return (
        <div
            className={clsx("relative shrink-0 overflow-hidden group/overlay cursor-pointer", className)}
            onClick={handleContainerClick}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            <CoverImage
                song={song}
                className={clsx("w-full h-full object-cover", coverClassName)}
                iconClassName={iconClassName}
            />

            {/* Overlay Layer */}
            <div className={clsx(
                "absolute inset-0 flex items-center justify-center transition-all duration-200 z-10",
                isCurrent
                    ? "bg-black/50"
                    : "bg-transparent group-hover/overlay:bg-black/40 group-hover/overlay:backdrop-blur-[1px]"
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
                        <div className="hidden group-hover/overlay:flex items-center justify-center">
                            {isPlaying ? (
                                <MdPause className="text-white text-xl drop-shadow-md" />
                            ) : (
                                <MdPlayArrow className="text-white text-xl drop-shadow-md ml-0.5" />
                            )}
                        </div>

                        {/* Current & Not Hovered: Indicator */}
                        <div className="flex group-hover/overlay:hidden items-center justify-center w-4 h-4">
                            <Equalizer
                                isPlaying={isPlaying}
                                className="bg-white"
                            />
                        </div>
                    </>
                ) : (
                    /* Not Current: Only show Play icon on hover */
                    <div className="hidden group-hover/overlay:flex items-center justify-center">
                        <MdPlayArrow className="text-white text-xl drop-shadow-md ml-0.5 animate-in fade-in duration-200" />
                    </div>
                )}
            </div>
        </div>
    );
}
