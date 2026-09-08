import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useTheme } from '@/hooks/useTheme';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';

import { PlayerBackground } from '@/features/player/now-playing/background/PlayerBackground';
import NowPlayingTopBar from '@/features/player/now-playing/toolbar/NowPlayingTopBar';
import {
    NowPlayingNarrowPanelLayout,
    NowPlayingStandardLayout,
} from '@/features/player/now-playing/layouts/NowPlayingLayouts';
import { useNowPlayingPanels } from '@/features/player/now-playing/hooks/useNowPlayingPanels';
import { useCoverBackground } from '@/features/player/now-playing/hooks/useCoverBackground';
import { useImmersiveFullscreen } from '@/features/player/now-playing/hooks/useImmersiveFullscreen';
import { useImmersivePlaybackControls } from '@/features/player/now-playing/hooks/useImmersivePlaybackControls';
import { useNarrowPanelControls } from '@/features/player/now-playing/hooks/useNarrowPanelControls';
import { useLowFrequencyLevel } from '@/features/player/now-playing/hooks/useLowFrequencyLevel';

export default function NowPlayingView({
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
    const metadata = usePlayerStore(state => state.metadata);
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const isShuffling = usePlayerStore(state => state.isShuffling);
    const repeatMode = usePlayerStore(state => state.repeatMode);
    const toggleRepeat = usePlayerStore(state => state.toggleRepeat);
    const volume = usePlayerStore(state => state.volume);
    const isQueueOpen = usePlayerStore(state => state.isQueueOpen);
    const isLyricsOpen = usePlayerStore(state => state.isLyricsOpen);
    const lyricsDocument = usePlayerStore(state => state.lyricsDocument);
    const lyricsStatus = usePlayerStore(state => state.lyricsStatus);
    const lyricsPath = usePlayerStore(state => state.lyricsPath);
    const setPlaybackTime = usePlayerStore(state => state.setPlaybackTime);
    const requestLyricsForPath = usePlayerStore(state => state.requestLyricsForPath);

    const toggleFavorite = useLibraryStore(state => state.toggleFavorite);
    const push = useNavigationStore(state => state.push);
    const { playNext, playPrev, seek, setVolume, togglePlayback, toggleShuffle } = usePlaybackActions();
    const { playerEffectMode, reactiveBackgroundEnabled } = useTheme();
    const lowFrequencyRef = useLowFrequencyLevel(
        isOpen && isPlaying && playerEffectMode === 'animation' && reactiveBackgroundEnabled,
    );

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
    } = useNowPlayingPanels({
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
        setPlaybackTime,
        seek,
        onNarrowActivity: handleNarrowActivity,
    });

    const { isFullscreen, toggleFullscreen } = useImmersiveFullscreen(isOpen);
    const handlePlayPrev = useCallback(() => {
        void playPrev(usePlayerStore.getState().currentTime);
    }, [playPrev]);

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
        playPrev: handlePlayPrev,
        togglePlay: () => void togglePlayback(),
        playNext,
        toggleRepeat,
        repeatMode,
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
        lyricsDocument,
        lyricsPath,
        lyricsStatus,
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
            <PlayerBackground
                src={bgImageSrc}
                active={isOpen}
                variant={playerEffectMode === 'animation' ? 'fluid' : 'blurred'}
                lowFrequencyRef={lowFrequencyRef}
            />

            <NowPlayingTopBar
                isFullscreen={isFullscreen}
                onClose={onClose}
                toggleFullscreen={toggleFullscreen}
            />

            <div className="relative flex-1 min-h-0 w-full overflow-hidden">
                <AnimatePresence initial={false}>
                    {isNarrowPanelLayout ? (
                        <NowPlayingNarrowPanelLayout
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
                        <NowPlayingStandardLayout
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
