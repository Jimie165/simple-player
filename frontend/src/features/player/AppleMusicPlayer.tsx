import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useTheme } from '@/hooks/useTheme';

import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { audioService } from '@/services/audioService';
import { resolveCover } from '@/utils/mediaPath';
import CoverImage from '@/components/common/CoverImage';
import { PlayerBackground } from '@/features/player/apple/PlayerBackground';
import ApplePlayerControlsSection from '@/features/player/apple/ApplePlayerControlsSection';
import ApplePlayerTopBar from '@/features/player/apple/ApplePlayerTopBar';
import ApplePlayerQueuePanel from '@/features/player/apple/ApplePlayerQueuePanel';
import ApplePlayerQueueToggle from '@/features/player/apple/ApplePlayerQueueToggle';
import ApplePlayerLyricsToggle from '@/features/player/apple/ApplePlayerLyricsToggle';
import ApplePlayerLyricsPanel from '@/features/player/apple/ApplePlayerLyricsPanel';

type SidePanel = 'queue' | 'lyrics';

export default function AppleMusicPlayer({ onClose, isOpen }: { onClose: () => void; isOpen: boolean }) {
    const {
        metadata, isPlaying, isShuffling, repeatMode,
        togglePlay, toggleRepeat
    } = usePlayerStore();

    const { toggleFavorite } = useLibraryStore();

    const { push } = useNavigationStore();
    const { playNext, playPrev, seek, toggleShuffle } = usePlaybackActions();

    // Local state for UI
    const {
        volume,
        setVolume,
        isQueueOpen,
        toggleQueue,
        isLyricsOpen,
        toggleLyrics,
        lyrics,
        lyricsStatus,
        lyricsHasTimestamps,
        lyricsPath,
        requestLyricsForPath,
    } = usePlayerStore();
    const { playerEffectMode } = useTheme();
    const [localVolume, setLocalVolume] = useState(volume);
    const [isVolumeDragging, setIsVolumeDragging] = useState(false);

    const displayVolume = isVolumeDragging ? localVolume : volume;

    const [currentTime, setCurrentTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [bgImageSrc, setBgImageSrc] = useState<string | null>(null);
    // Removed: const [showQueue, setShowQueue] = useState(false);


    // Layout sizing state
    // Lazy load queue: mount if open, keep mounted once opened
    const [queueMounted, setQueueMounted] = useState(isQueueOpen);
    const [queueScrollToTopSignal, setQueueScrollToTopSignal] = useState(0);
    const queueScrollDidMountRef = useRef(false);
    const [lyricsMounted, setLyricsMounted] = useState(isLyricsOpen);
    const [marqueeResetToken, setMarqueeResetToken] = useState(0);
    const [panelFlipTarget, setPanelFlipTarget] = useState<SidePanel | null>(null);
    const [isPanelFlipping, setIsPanelFlipping] = useState(false);
    const panelFlipRafRef = useRef<number | null>(null);
    const panelFlipTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (isQueueOpen) setQueueMounted(true);
    }, [isQueueOpen]);

    useEffect(() => {
        if (isLyricsOpen) setLyricsMounted(true);
    }, [isLyricsOpen]);

    useEffect(() => {
        if (!queueScrollDidMountRef.current) {
            queueScrollDidMountRef.current = true;
            return;
        }
        if (isQueueOpen) setQueueScrollToTopSignal((v) => v + 1);
    }, [isQueueOpen]);

    useEffect(() => {
        if (isOpen && isQueueOpen) setQueueScrollToTopSignal((v) => v + 1);
    }, [isOpen, isQueueOpen]);

    useEffect(() => {
        if (isOpen) {
            setMarqueeResetToken((v) => v + 1);
        }
    }, [isOpen]);

    useEffect(() => {
        return () => {
            if (panelFlipRafRef.current !== null) window.cancelAnimationFrame(panelFlipRafRef.current);
            if (panelFlipTimeoutRef.current !== null) window.clearTimeout(panelFlipTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (metadata?.path && metadata.path !== lyricsPath) {
            requestLyricsForPath(metadata.path);
        }
        if (!metadata?.path && lyricsPath !== null) {
            requestLyricsForPath(undefined);
        }
    }, [metadata?.path, lyricsPath, requestLyricsForPath]);

    // Layout sizing state
    const coverRef = useRef<HTMLDivElement>(null);
    const coverShellRef = useRef<HTMLDivElement>(null);
    const controlsRef = useRef<HTMLDivElement>(null);

    // Use pure DOM manipulation for performance (avoids React render cycle lag during animation)
    useEffect(() => {
        if (!coverShellRef.current || !controlsRef.current) return;

        const updateWidth = () => {
            if (coverShellRef.current && controlsRef.current) {
                const width = coverShellRef.current.getBoundingClientRect().width;
                controlsRef.current.style.width = `${width}px`;
            }
        };

        // Initial set
        updateWidth();

        const observer = new ResizeObserver(() => {
            // Directly set style to avoid React render lag
            requestAnimationFrame(updateWidth);
        });

        observer.observe(coverShellRef.current);

        // Also listen to transitionend on the parent or window resize for good measure
        window.addEventListener('resize', updateWidth);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateWidth);
        };
    }, []);

    // Sync volume with audio service
    useEffect(() => {
        // Initial volume read (mock, usually we'd need a getter or store)
        // We could read from audioService if it exposed a getter, or assume store is source of truth if we sync it.
        // For now, let's just default to 1 or whatever usePlayerStore says if we had it.
    }, []);

    // Sync local currentTime with store/audioService when component mounts or metadata changes
    useEffect(() => {
        if (!metadata) return;
        // We can get the current time from the audio service directly to prevent reset
        const syncTime = async () => {
            const t = await audioService.getCurrentTime();
            setCurrentTime(t);
        };
        syncTime();

        // Listen for seek event from other components
        const handleSeekEvent = (event: Event) => {
            const detail = (event as CustomEvent<{ time?: unknown }>).detail;
            if (detail && typeof detail.time === 'number') {
                setCurrentTime(detail.time);
            }
        };
        window.addEventListener('playback:seeked', handleSeekEvent);

        return () => {
            window.removeEventListener('playback:seeked', handleSeekEvent);
        };
    }, [metadata, isOpen]); // Run on mount, song change, or when player opens

    const handleVolumeChange = (val: number) => {
        setLocalVolume(val);
        // Direct audio service update for smooth real-time listening feedback
        audioService.setVolume(val / 100);
    };

    const handleVolumeSeekStart = () => {
        setIsVolumeDragging(true);
    };

    const handleVolumeSeekEnd = () => {
        setIsVolumeDragging(false);
        setVolume(localVolume);
    };

    // Load Background Image
    useEffect(() => {
        let isMounted = true;
        const loadBg = async () => {
            if (metadata) {
                const src = await resolveCover(metadata);
                if (isMounted) setBgImageSrc(src);
            } else {
                if (isMounted) setBgImageSrc(null);
            }
        };
        loadBg();
        return () => { isMounted = false; };
    }, [metadata]);



    // Progress Logic with Auto-Sync
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        let tickCount = 0;

        if (isPlaying && !isDragging) {
            interval = setInterval(() => {
                tickCount++;

                // Every 4 ticks (2 seconds), sync with backend to correct drift or handle loop reset
                if (tickCount % 4 === 0) {
                    audioService.getCurrentTime().then(t => {
                        // Only update if difference is significant (>0.5s) or if it looped (decreased)
                        setCurrentTime(prev => {
                            if (t < prev - 1 || Math.abs(t - prev) > 0.5) return t;
                            return prev + 0.5;
                        });
                    }).catch((error) => console.warn('Failed to sync playback time', error));
                } else {
                    setCurrentTime(prev => {
                        // If we are past estimated duration, wait for PlaybackControls to handle song end and dispatch seeked event
                        if (metadata && metadata.duration > 0 && prev >= metadata.duration) return metadata.duration;
                        // Just increment
                        return prev + 0.5;
                    });
                }
            }, 500);
        }
        return () => clearInterval(interval);
    }, [isPlaying, isDragging, metadata]);

    // Reset time on song change
    // useEffect(() => {
    //    setCurrentTime(0);
    // }, [metadata]); 
    // Commented out: This was causing the progress bar to reset to 0 even when re-opening the player for the same song.
    // The previous useEffect handles syncing the correct time on mount/change.

    const handleSeekStart = () => {
        setIsDragging(true);
        window.dispatchEvent(new CustomEvent('playback:dragging', { detail: { dragging: true } }));
    };

    const handleSeekChange = (val: number) => {
        setCurrentTime(val);
        // Dispatch event for real-time sync with external player
        window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: val } }));
    };

    const handleSeekEnd = async () => {
        setIsDragging(false);
        const actualTime = await seek(currentTime);
        setCurrentTime(actualTime);
        window.dispatchEvent(new CustomEvent('playback:dragging', { detail: { dragging: false } }));
    };

    const startPanelFlip = (target: SidePanel, toggle: () => void) => {
        if (panelFlipRafRef.current !== null) window.cancelAnimationFrame(panelFlipRafRef.current);
        if (panelFlipTimeoutRef.current !== null) window.clearTimeout(panelFlipTimeoutRef.current);

        setPanelFlipTarget(target);
        setIsPanelFlipping(false);
        panelFlipRafRef.current = window.requestAnimationFrame(() => {
            setIsPanelFlipping(true);
            toggle();
            panelFlipTimeoutRef.current = window.setTimeout(() => {
                setIsPanelFlipping(false);
                setPanelFlipTarget(null);
            }, 420);
        });
    };

    const handleToggleQueue = () => {
        if (!queueMounted) setQueueMounted(true);
        if (isLyricsOpen && !isQueueOpen) {
            startPanelFlip('queue', toggleQueue);
            return;
        }
        toggleQueue();
    };

    const handleToggleLyrics = () => {
        if (!lyricsMounted) setLyricsMounted(true);
        if (isQueueOpen && !isLyricsOpen) {
            startPanelFlip('lyrics', toggleLyrics);
            return;
        }
        toggleLyrics();
    };

    // Fullscreen Logic
    const [isFullscreen, setIsFullscreen] = useState(false);
    const wasMaximizedBeforeFullscreenRef = useRef(false);

    useEffect(() => {
        const checkFullscreen = async () => {
            try {
                const isFull = await getCurrentWindow().isFullscreen();
                setIsFullscreen(isFull);
            } catch (e) {
                console.error("Failed to check fullscreen status", e);
            }
        };
        checkFullscreen();
    }, [isOpen]);

    const toggleFullscreen = async () => {
        const appWindow = getCurrentWindow();
        const fullscreenWindow = appWindow as typeof appWindow & { unmaximize?: () => Promise<void> };
        try {
            const currentFullscreen = await appWindow.isFullscreen();
            const newState = !currentFullscreen;

            if (newState) {
                const wasMaximized = await appWindow.isMaximized();
                wasMaximizedBeforeFullscreenRef.current = wasMaximized;
                if (wasMaximized) {
                    if (typeof fullscreenWindow.unmaximize === 'function') {
                        await fullscreenWindow.unmaximize();
                    } else {
                        await appWindow.toggleMaximize();
                    }
                    await new Promise(requestAnimationFrame);
                }
                await appWindow.setFullscreen(true);
                setIsFullscreen(true);
            } else {
                await appWindow.setFullscreen(false);
                setIsFullscreen(false);
                if (wasMaximizedBeforeFullscreenRef.current) {
                    await appWindow.maximize();
                    wasMaximizedBeforeFullscreenRef.current = false;
                }
            }
        } catch (e) {
            console.error("Failed to toggle fullscreen", e);
        }
    };

    // Auto-exit fullscreen on close
    useEffect(() => {
        if (!isOpen && isFullscreen) {
            const appWindow = getCurrentWindow();
            appWindow.setFullscreen(false).catch(console.error);
            if (wasMaximizedBeforeFullscreenRef.current) {
                appWindow.maximize().catch(console.error);
                wasMaximizedBeforeFullscreenRef.current = false;
            }
            setIsFullscreen(false);
        }
    }, [isOpen, isFullscreen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (!isFullscreen) return;

            event.preventDefault();
            event.stopPropagation();
            void toggleFullscreen();
        };

        window.addEventListener('keydown', handleEscape, { capture: true });
        return () => window.removeEventListener('keydown', handleEscape, { capture: true });
    }, [isOpen, isFullscreen]);

    // const lastCloseRef = React.useRef(0); // Removed

    // Background Image Source - already handled by state
    return (
        <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{
                opacity: isOpen ? 1 : 0,
                y: isOpen ? 0 : '100%',
                pointerEvents: isOpen ? 'auto' : 'none'
            }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 z-[200] flex flex-col overflow-hidden bg-neutral-900"
        >
            {/* Background Layer - Memoized to prevent re-renders during drag */}
            <PlayerBackground src={bgImageSrc} variant={playerEffectMode === 'animation' ? 'fluid' : 'blurred'} />

            <ApplePlayerTopBar
                isFullscreen={isFullscreen}
                onClose={onClose}
                toggleFullscreen={toggleFullscreen}
            />

            {/* Content Layer - Responsive Flex Layout */}
            <div className="relative z-20 flex-1 flex w-full min-h-0 px-[clamp(1rem,3vw,2rem)] pb-[clamp(3.5rem,6vw,5rem)]">

                <div className={clsx(
                    "relative z-20 flex flex-col items-center justify-center mr-auto transition-[width,padding-left,padding-right] duration-500 ease-[0.32,0.72,0,1]",
                    (isQueueOpen || isLyricsOpen) ? "w-[41%] pr-[clamp(0.5rem,1.5vw,1rem)]" : "w-full px-[clamp(1rem,4vw,3rem)]"
                )}>
                    {/* Content Wrapper: Controls vertical spacing */}
                    <div className="w-full h-full max-w-[500px] flex flex-col gap-8 justify-center items-center mx-auto">

                        {/* Artwork Container - Auto scaling with aspect ratio preservation */}
                        {/* flex-1 min-h-0 allows shrinking. flex justify-center aligns it. */}
                        <div className="flex-1 min-h-0 flex items-center justify-center w-full">
                            <div
                                ref={coverShellRef}
                                className="relative aspect-square h-auto w-auto max-h-full max-w-full flex-shrink-0"
                            >
                                {/* Invisible 1000x1000 placeholder to force intrinsic size expansion to the limits, keeping perfect 1:1 ratio. */}
                                <img
                                    src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAwIiBoZWlnaHQ9IjEwMDAiPjwvc3ZnPg=="
                                    alt=""
                                    className="invisible block h-auto w-auto max-w-full max-h-full pointer-events-none"
                                />
                                <motion.div
                                    ref={coverRef}
                                    className="absolute inset-0 rounded-[12px] md:rounded-[18px] shadow-2xl overflow-hidden bg-white/5"
                                    animate={{
                                        scale: isPlaying ? 1 : 0.85,
                                        boxShadow: isPlaying ? "0 20px 40px -8px rgba(0, 0, 0, 0.5)" : "0 10px 20px -5px rgba(0, 0, 0, 0.3)"
                                    }}
                                    transition={{ type: "spring", stiffness: 200, damping: 24, mass: 1 }}
                                >
                                    <CoverImage
                                        song={metadata}
                                        className="w-full h-full object-cover"
                                        iconClassName="text-white/20 text-9xl"
                                    />
                                </motion.div>
                            </div>
                        </div>

                        {/* Controls Container - Fixed Height */}
                        <ApplePlayerControlsSection
                            controlsRef={controlsRef}
                            metadata={metadata}
                            marqueeResetToken={marqueeResetToken}
                            onClose={onClose}
                            push={push}
                            toggleFavorite={toggleFavorite}
                            currentTime={currentTime}
                            handleSeekChange={handleSeekChange}
                            handleSeekStart={handleSeekStart}
                            handleSeekEnd={handleSeekEnd}
                            isShuffling={isShuffling}
                            toggleShuffle={toggleShuffle}
                            playPrev={() => playPrev(currentTime)}
                            togglePlay={togglePlay}
                            isPlaying={isPlaying}
                            playNext={playNext}
                            toggleRepeat={toggleRepeat}
                            repeatMode={repeatMode}
                            localVolume={displayVolume}
                            handleVolumeChange={handleVolumeChange}
                            handleVolumeSeekStart={handleVolumeSeekStart}
                            handleVolumeSeekEnd={handleVolumeSeekEnd}
                        />
                    </div>
                </div>

                <ApplePlayerQueuePanel
                    isQueueOpen={isQueueOpen}
                    queueMounted={queueMounted}
                    panelFlipTarget={panelFlipTarget}
                    isPanelFlipping={isPanelFlipping}
                    onClose={onClose}
                    queueScrollToTopSignal={queueScrollToTopSignal}
                />

                <ApplePlayerLyricsPanel
                    isLyricsOpen={isLyricsOpen}
                    lyricsMounted={lyricsMounted}
                    panelFlipTarget={panelFlipTarget}
                    isPanelFlipping={isPanelFlipping}
                    lyrics={lyrics}
                    lyricsStatus={lyricsStatus}
                    hasTimestamps={lyricsHasTimestamps}
                    currentTime={currentTime}
                    onSeek={seek}
                />
            </div>

            <div className="absolute bottom-[clamp(1rem,2.5vw,2rem)] right-[clamp(1rem,2.5vw,2rem)] z-30 flex items-center gap-[clamp(0.5rem,1.2vw,0.85rem)]">
                <ApplePlayerLyricsToggle
                    isLyricsOpen={isLyricsOpen}
                    // 允许在面板已展开但当前歌曲无歌词时仍可点击按钮关闭面板；
                    // 只有在面板关闭后才禁用，防止再次打开。
                    hasLyrics={lyricsStatus !== 'empty' || isLyricsOpen}
                    onToggle={handleToggleLyrics}
                />
                <ApplePlayerQueueToggle
                    isQueueOpen={isQueueOpen}
                    onToggle={handleToggleQueue}
                />
            </div>


        </motion.div >
    );
}
