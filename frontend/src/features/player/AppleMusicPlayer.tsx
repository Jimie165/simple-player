import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useTheme } from '@/hooks/useTheme';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';

import { PlayerBackground } from '@/features/player/apple/background/PlayerBackground';
import ApplePlayerTopBar from '@/features/player/apple/toolbar/ApplePlayerTopBar';
import {
    AppleMusicNarrowPanelLayout,
    AppleMusicStandardLayout,
} from '@/features/player/apple/layouts/AppleMusicPlayerLayouts';
import { useAppleMusicPanels } from '@/features/player/apple/hooks/useAppleMusicPanels';
import { useCoverBackground } from '@/features/player/apple/hooks/useCoverBackground';
import { useImmersiveFullscreen } from '@/features/player/apple/hooks/useImmersiveFullscreen';
import { useImmersivePlaybackControls } from '@/features/player/apple/hooks/useImmersivePlaybackControls';
import { useNarrowPanelControls } from '@/features/player/apple/hooks/useNarrowPanelControls';

export default function AppleMusicPlayer({
    onClose,
    onOpened,
    isOpen,
    mainContentWidth,
}: {
    onClose: () => void;
    onOpened: () => void;
    isOpen: boolean;
    mainContentWidth: number;
}) {
    const {
        metadata, isPlaying, isShuffling, repeatMode,
        togglePlay, toggleRepeat
    } = usePlayerStore();
    const {
        volume,
        setVolume,
        isQueueOpen,
        isLyricsOpen,
        lyrics,
        lyricsStatus,
        lyricsHasTimestamps,
        lyricsPath,
        currentTime,
        setPlaybackTime,
        requestLyricsForPath,
    } = usePlayerStore();

    const { toggleFavorite } = useLibraryStore();
    const { push } = useNavigationStore();
    const { playNext, playPrev, seek, toggleShuffle } = usePlaybackActions();
    const { playerEffectMode } = useTheme();

    const [marqueeResetToken, setMarqueeResetToken] = useState(0);
    const isNarrowPanelLayout = mainContentWidth < 560 && (isQueueOpen || isLyricsOpen);
    const coverScale = isPlaying ? 1 : 0.85;
    const bgImageSrc = useCoverBackground(metadata);
    const coverRef = useRef<HTMLDivElement>(null);
    const coverShellRef = useRef<HTMLDivElement>(null);
    const controlsRef = useRef<HTMLDivElement>(null);

    const {
        narrowControlsVisible,
        narrowControlsRef,
        revealNarrowControls,
        handleNarrowPanelScroll,
        handleNarrowActivity,
        handleNarrowPointerMove,
        handleNarrowControlsPointerEnter,
        handleNarrowControlsPointerMove,
        handleNarrowControlsPointerLeave,
    } = useNarrowPanelControls({
        isOpen,
        isNarrowPanelLayout,
        isQueueOpen,
        isLyricsOpen,
    });
    const handleBeforeNarrowClose = useCallback(() => {
        revealNarrowControls(false);
    }, [revealNarrowControls]);

    const {
        queueMounted,
        queueScrollToTopSignal,
        lyricsMounted,
        panelFlipTarget,
        isPanelFlipping,
        closingPanel,
        handleToggleQueue,
        handleToggleLyrics,
    } = useAppleMusicPanels({
        isOpen,
        isQueueOpen,
        isLyricsOpen,
        lyricsStatus,
        mainContentWidth,
        isNarrowPanelLayout,
        onBeforeNarrowClose: handleBeforeNarrowClose,
    });

    const {
        displayVolume,
        handleSeekChange,
        handleSeekStart,
        handleSeekEnd,
        handleVolumeChange,
        handleVolumeSeekStart,
        handleVolumeSeekEnd,
    } = useImmersivePlaybackControls({
        volume,
        setVolume,
        metadata,
        isOpen,
        isPlaying,
        currentTime,
        setPlaybackTime,
        seek,
        onNarrowActivity: handleNarrowActivity,
    });

    const { isFullscreen, toggleFullscreen } = useImmersiveFullscreen(isOpen);

    useEffect(() => {
        if (!isOpen) return;
        const frame = requestAnimationFrame(() => setMarqueeResetToken((v) => v + 1));
        return () => cancelAnimationFrame(frame);
    }, [isOpen]);

    useEffect(() => {
        if (metadata?.path && metadata.path !== lyricsPath) {
            requestLyricsForPath(metadata.path);
        }
        if (!metadata?.path && lyricsPath !== null) {
            requestLyricsForPath(undefined);
        }
    }, [metadata?.path, lyricsPath, requestLyricsForPath]);

    useEffect(() => {
        if (!isOpen || isNarrowPanelLayout) return;

        let observer: ResizeObserver | null = null;
        const updateWidth = () => {
            if (coverShellRef.current && controlsRef.current) {
                const width = coverShellRef.current.getBoundingClientRect().width;
                controlsRef.current.style.width = `${width}px`;
            }
        };

        const timer = setTimeout(() => {
            if (!coverShellRef.current || !controlsRef.current) return;
            updateWidth();
            observer = new ResizeObserver(() => {
                requestAnimationFrame(updateWidth);
            });
            observer.observe(coverShellRef.current);
            window.addEventListener('resize', updateWidth);
        }, 0);

        return () => {
            clearTimeout(timer);
            if (observer) observer.disconnect();
            window.removeEventListener('resize', updateWidth);
        };
    }, [isOpen, isNarrowPanelLayout]);

    const layoutProps = {
        metadata,
        bgImageSrc,
        coverScale,
        isPlaying,
        isShuffling,
        toggleShuffle,
        playPrev: () => playPrev(currentTime),
        togglePlay,
        playNext,
        toggleRepeat,
        repeatMode,
        currentTime,
        handleSeekChange,
        handleSeekStart,
        handleSeekEnd,
        localVolume: displayVolume,
        handleVolumeChange,
        handleVolumeSeekStart,
        handleVolumeSeekEnd,
        marqueeResetToken,
        onClose,
        push,
        toggleFavorite,
        isQueueOpen,
        isLyricsOpen,
        queueMounted,
        lyricsMounted,
        panelFlipTarget,
        isPanelFlipping,
        queueScrollToTopSignal,
        lyrics,
        lyricsPath,
        lyricsStatus,
        lyricsHasTimestamps,
        seek,
        handleToggleLyrics,
        handleToggleQueue,
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{
                opacity: isOpen ? 1 : 0,
                y: isOpen ? 0 : '100%',
                pointerEvents: isOpen ? 'auto' : 'none'
            }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            onAnimationComplete={() => {
                if (isOpen) onOpened();
            }}
            style={{ willChange: isOpen ? 'transform, opacity' : 'auto', backfaceVisibility: 'hidden' }}
            className="absolute inset-0 z-200 flex flex-col overflow-hidden bg-neutral-900"
            onPointerDown={handleNarrowPointerMove}
            onPointerMove={handleNarrowPointerMove}
        >
            <PlayerBackground src={bgImageSrc} active={isOpen} variant={playerEffectMode === 'animation' ? 'fluid' : 'blurred'} />

            <ApplePlayerTopBar
                isFullscreen={isFullscreen}
                onClose={onClose}
                toggleFullscreen={toggleFullscreen}
            />

            <div className="relative flex-1 min-h-0 w-full overflow-hidden">
                <AnimatePresence initial={false}>
                    {isNarrowPanelLayout ? (
                        <AppleMusicNarrowPanelLayout
                            {...layoutProps}
                            closingPanel={closingPanel}
                            narrowControlsVisible={narrowControlsVisible}
                            narrowControlsRef={narrowControlsRef}
                            handleNarrowPanelScroll={handleNarrowPanelScroll}
                            handleNarrowControlsPointerEnter={handleNarrowControlsPointerEnter}
                            handleNarrowControlsPointerMove={handleNarrowControlsPointerMove}
                            handleNarrowControlsPointerLeave={handleNarrowControlsPointerLeave}
                        />
                    ) : (
                        <AppleMusicStandardLayout
                            {...layoutProps}
                            mainContentWidth={mainContentWidth}
                            coverRef={coverRef}
                            coverShellRef={coverShellRef}
                            controlsRef={controlsRef}
                        />
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
