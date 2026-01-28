import React, { useState, useEffect, useRef, useMemo } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
    IoPlay, IoPause,
    IoShuffle, IoRepeat,
    IoVolumeLow, IoVolumeHigh,
    IoList, IoStar, IoStarOutline, IoEllipsisHorizontal,
    IoPlayBack, IoPlayForward
} from 'react-icons/io5';

import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useNavigationStore } from '../../store/useNavigationStore';

import { usePlaybackActions } from '../../hooks/usePlaybackActions';
import { useSongOperations } from '../../hooks/useSongOperations';
import type { SongMetadata } from '../../types';
import { audioService } from '../../services/audioService';
import { formatTime } from '../../utils/time';
import { resolveCover } from '../../utils/cover';
import CoverImage from '../../components/common/CoverImage';
import MusicContextMenu from '../../components/common/MusicContextMenu';
import MusicSlider from '../../components/common/MusicSlider';
import AppleMusicQueue from './AppleMusicQueue';

export default function AppleMusicPlayer({ onClose, isOpen }: { onClose: () => void; isOpen: boolean }) {
    const {
        metadata, isPlaying, isShuffling, repeatMode,
        togglePlay, toggleShuffle, toggleRepeat
    } = usePlayerStore();

    const { toggleFavorite } = useLibraryStore();

    const { push } = useNavigationStore();
    const { playNext, playPrev, seek } = usePlaybackActions();

    // Local state for UI
    const { volume, setVolume, isQueueOpen, toggleQueue } = usePlayerStore();
    const [currentTime, setCurrentTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [bgImageSrc, setBgImageSrc] = useState<string | null>(null);
    // Removed: const [showQueue, setShowQueue] = useState(false);


    // Layout sizing state
    // Lazy load queue: mount if open, keep mounted once opened
    const [queueMounted, setQueueMounted] = useState(isQueueOpen);
    const [queueScrollToTopSignal, setQueueScrollToTopSignal] = useState(0);
    const queueScrollDidMountRef = useRef(false);

    useEffect(() => {
        if (isQueueOpen) setQueueMounted(true);
    }, [isQueueOpen]);

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

    // Preload queue after a short delay to ensure smooth entry animation
    // This allows the queue to be ready in the DOM before the user even clicks the button
    useEffect(() => {
        const timer = setTimeout(() => {
            setQueueMounted(true);
        }, 600); // 600ms delay to avoid impacting the heavy entry animation
        return () => clearTimeout(timer);
    }, []);

    // Layout sizing state
    const coverRef = useRef<HTMLDivElement>(null);
    const controlsRef = useRef<HTMLDivElement>(null);

    // Use pure DOM manipulation for performance (avoids React render cycle lag during animation)
    useEffect(() => {
        if (!coverRef.current || !controlsRef.current) return;

        const updateWidth = () => {
            if (coverRef.current && controlsRef.current) {
                const width = coverRef.current.getBoundingClientRect().width;
                controlsRef.current.style.width = `${width}px`;
            }
        };

        // Initial set
        updateWidth();

        const observer = new ResizeObserver(() => {
            // Directly set style to avoid React render lag
            requestAnimationFrame(updateWidth);
        });

        observer.observe(coverRef.current);

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
        const handleSeekEvent = (e: any) => {
            if (e.detail && typeof e.detail.time === 'number') {
                setCurrentTime(e.detail.time);
            }
        };
        window.addEventListener('playback:seeked', handleSeekEvent);

        return () => {
            window.removeEventListener('playback:seeked', handleSeekEvent);
        };
    }, [metadata]); // Run on mount (metadata available) and when song changes

    const handleVolumeChange = async (val: number) => {
        setVolume(val); // This also calls audioService.setVolume inside the store
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
                    }).catch(() => { });
                } else {
                    setCurrentTime(prev => {
                        // If we are past estimated duration, clamp or wait for sync
                        if (metadata && metadata.duration > 0 && prev >= metadata.duration + 1) return 0; // Optimistic loop? No, let sync handle it.
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

    const handleSeekEnd = () => {
        setIsDragging(false);
        seek(currentTime);
        window.dispatchEvent(new CustomEvent('playback:dragging', { detail: { dragging: false } }));
    };

    const handleToggleQueue = () => {
        if (!queueMounted) setQueueMounted(true);
        toggleQueue();
    };

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
            <BackgroundLayer src={bgImageSrc} />

            {/* Top Bar (Drag Region) - Fixed Height */}
            <div
                data-tauri-drag-region
                className="w-full h-16 z-50 flex justify-center items-center flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            >
                <button
                    onClick={onClose}
                    className="w-12 h-1.5 bg-white/40 rounded-full hover:bg-white/60 transition-colors cursor-pointer"
                />
            </div>

            {/* Content Layer - Responsive Flex Layout */}
            <div className="relative z-20 flex-1 flex w-full min-h-0 px-8 pb-8 md:pb-12">

                <div className={clsx(
                    "flex flex-col items-center justify-center mr-auto transition-[width,padding-left,padding-right] duration-500 ease-[0.32,0.72,0,1]",
                    isQueueOpen ? "w-[42%] pr-4" : "w-full px-12"
                )}>
                    {/* Content Wrapper: Controls vertical spacing */}
                    <div className="w-full h-full max-w-[500px] flex flex-col gap-6 md:gap-8 justify-center items-center mx-auto">

                        {/* Artwork Container - Auto scaling with aspect ratio preservation */}
                        {/* flex-1 min-h-0 allows shrinking. flex justify-center aligns it. */}
                        <div className="flex-1 min-h-0 flex items-center justify-center w-full">
                            {/* 
                                Key Layout Fix: 
                                max-h-full: Don't exceed parent height.
                                max-w-full: Don't exceed parent width.
                                aspect-square: Maintain 1:1.
                                w-auto h-auto: Let the aspect ratio and max constraints drive the size.
                             */}
                            <motion.div
                                ref={coverRef}
                                className="relative aspect-square h-auto w-auto max-h-full max-w-full rounded-[12px] md:rounded-[18px] shadow-2xl overflow-hidden bg-white/5"
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

                        {/* Controls Container - Fixed Height */}
                        <div
                            ref={controlsRef}
                            className="flex flex-col gap-2 flex-shrink-0 transition-[width] duration-0 ease-linear" // duration-0 as we drive it manually? Actually keeping transition might fight with JS. Let's make it instant or very fast to follow JS.
                            // If we drive it frame-by-frame, we don't want CSS transition smoothing it out and lagging.
                            style={{ width: '100%' }} // Initial fallback, will be overridden by JS immediately
                        >

                            {/* Title & Artist Row */}
                            <div className="flex items-center justify-between px-0.5">
                                <div className="flex flex-col min-w-0 pr-4">
                                    <h1 className="text-xl md:text-2xl font-bold text-white truncate drop-shadow-md leading-tight">
                                        {metadata?.title || "未播放音乐"}
                                    </h1>
                                    <div className="text-base md:text-lg text-white/60 truncate font-medium leading-tight mt-1 flex items-center gap-1">
                                        <span
                                            onClick={() => {
                                                if (metadata?.artist) {
                                                    push({ type: 'artist_detail', data: { name: metadata.artist, count: 0, albumCount: 0, songs: [], cover: null } });
                                                    onClose();
                                                }
                                            }}
                                            className="hover:underline hover:text-white/80 cursor-pointer transition-colors"
                                        >
                                            {metadata?.artist || "Simple Player"}
                                        </span>
                                        {metadata?.album && (
                                            <>
                                                <span>—</span>
                                                <span
                                                    onClick={() => {
                                                        if (metadata?.album) {
                                                            // Use full object structure to match what useSongOperations expects and prevent crashes
                                                            push({ type: 'album_detail', data: { name: metadata.album, artist: metadata.artist, songs: [], cover: metadata.cover || null, count: 0 } });
                                                            onClose();
                                                        }
                                                    }}
                                                    className="hover:underline hover:text-white/80 cursor-pointer transition-colors"
                                                >
                                                    {metadata.album}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => metadata && toggleFavorite(metadata)}
                                        className="w-8 h-8 flex-shrink-0 rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/20 flex items-center justify-center text-white/50 hover:text-red-500 transition-all backdrop-blur-md"
                                    >
                                        {metadata?.is_favorite ? <IoStar className="text-xl text-red-500" /> : <IoStarOutline className="text-xl" />}
                                    </button>

                                    {/* Unified Context Menu */}
                                    <MenuWrapper metadata={metadata} onClose={onClose} />
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="flex flex-col gap-1.5 mt-2">
                                <MusicSlider
                                    value={currentTime}
                                    min={0}
                                    max={metadata?.duration || 0}
                                    disabled={!metadata}
                                    onChange={handleSeekChange}
                                    onMouseDown={handleSeekStart}
                                    onMouseUp={handleSeekEnd}
                                    trackHeightClass="h-2"
                                    hoverHeightClass="group-hover:h-3.5"
                                    activeHeightClass="group-active:h-4"
                                />
                                <div className="flex justify-between text-[11px] font-medium text-white/40 select-none">
                                    <span>{formatTime(currentTime)}</span>
                                    <span>-{formatTime((metadata?.duration || 0) - currentTime)}</span>
                                </div>
                            </div>

                            {/* Main Controls - Responsive */}
                            <div className="flex items-center justify-between mt-[2%] w-full">
                                <button
                                    onClick={toggleShuffle}
                                    className={clsx(
                                        "flex-1 aspect-square max-w-[40px] flex items-center justify-center rounded-lg transition-colors hover:bg-white/10",
                                        isShuffling ? "text-primary" : "text-white/40 hover:text-white"
                                    )}
                                >
                                    <IoShuffle className="text-xl sm:text-2xl" />
                                </button>

                                <button onClick={() => playPrev(currentTime)} className="flex-1 aspect-square max-w-[48px] flex items-center justify-center text-white hover:opacity-70 transition-opacity">
                                    <IoPlayBack className="text-3xl sm:text-4xl" />
                                </button>

                                <button
                                    onClick={togglePlay}
                                    className="flex-shrink-0 w-[18%] max-w-[64px] aspect-square rounded-full bg-transparent text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all overflow-hidden"
                                >
                                    {isPlaying ? <IoPause className="text-4xl sm:text-6xl" /> : <IoPlay className="text-4xl sm:text-6xl" />}
                                </button>

                                <button onClick={playNext} className="flex-1 aspect-square max-w-[48px] flex items-center justify-center text-white hover:opacity-70 transition-opacity">
                                    <IoPlayForward className="text-3xl sm:text-4xl" />
                                </button>

                                <button
                                    onClick={toggleRepeat}
                                    className={clsx(
                                        "flex-1 aspect-square max-w-[40px] flex items-center justify-center rounded-lg transition-colors relative hover:bg-white/10",
                                        repeatMode !== 'off' ? "text-primary" : "text-white/40 hover:text-white"
                                    )}
                                >
                                    {repeatMode === 'one' ? (
                                        <div className="relative">
                                            <IoRepeat className="text-xl sm:text-2xl" />
                                            <span className="absolute -top-1 -right-1 text-[8px] font-bold">1</span>
                                        </div>
                                    ) : (
                                        <IoRepeat className="text-xl sm:text-2xl" />
                                    )}
                                </button>
                            </div>

                            {/* Volume Slider */}
                            <div className="flex items-center gap-3 mt-6 px-1">
                                <IoVolumeLow className="text-white/40 text-xs" />
                                <MusicSlider
                                    value={volume}
                                    min={0}
                                    max={100}
                                    onChange={handleVolumeChange}
                                    className="flex-1"
                                />
                                <IoVolumeHigh className="text-white/40 text-xs" />
                            </div>

                        </div>
                    </div>
                </div>

                {/* Right Side (Queue) - Slide In */}
                <div
                    className={clsx(
                        "flex-1 min-w-0 h-full max-h-[95%] flex flex-col z-30 overflow-hidden justify-center",
                        "transition-[max-width,padding-left,padding-right] duration-500 ease-[0.32,0.72,0,1]",
                        isQueueOpen ? "max-w-full pl-8 md:pl-9 pr-8" : "max-w-0 pl-0 pr-0"
                    )}
                >
                    <div className="relative flex-1 overflow-hidden">
                        <motion.div
                            className={clsx(
                                "absolute inset-0",
                                "transition-[opacity,transform] duration-500 ease-[0.32,0.72,0,1]",
                                isQueueOpen ? "opacity-100 translate-x-0" : "opacity-0 translate-x-5 pointer-events-none"
                            )}
                        >
                            {queueMounted && <AppleMusicQueue onNavigate={onClose} scrollToTopSignal={queueScrollToTopSignal} isOpen={isQueueOpen} />}
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* Bottom Right Actions (Queue/Lyrics) */}
            <div className="absolute bottom-8 right-8 z-30">
                <button className={clsx(
                    "p-3 rounded-xl transition-all backdrop-blur-md",
                    // Use conditional border/bg based on isQueueOpen
                    isQueueOpen
                        ? "bg-white/10 border border-white/10 text-white shadow-lg"
                        : "hover:bg-white/10 hover:text-white text-white/50"
                )}>
                    <IoList
                        className={clsx("text-xl", isQueueOpen ? "text-primary" : "")}
                        onClick={handleToggleQueue}
                    />
                </button>
            </div>


        </motion.div >
    );
}

// Sub-component for Menu Logic to keep main component clean

// Helper Component for Menu
function MenuWrapper({ metadata, onClose }: { metadata: SongMetadata | null, onClose: () => void }) {
    if (!metadata) return null;

    // We use a small local component to call the hook
    // This wrapper ensures hook rules are followed
    return <MenuButton metadata={metadata} onClose={onClose} />;
}

function MenuButton({ metadata, onClose }: { metadata: SongMetadata, onClose: () => void }) {
    const ops = useSongOperations({
        items: [metadata],
        context: 'other', // Use 'other' or 'player' generic context. 
        hideSelect: true,
        onNavigate: onClose,
    });

    // Filter out Play and Delete as requested
    const filteredGroups = useMemo(() => {
        return ops.menuItems.map(group =>
            group.filter(item => item.id !== 'play' && item.id !== 'delete')
        ).filter(group => group.length > 0);
    }, [ops.menuItems]);

    return (
        <MusicContextMenu
            groups={filteredGroups}
            variant="clean"
            buttonClassName="w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/20 flex items-center justify-center transition-all backdrop-blur-md text-white/50 hover:text-white"
        >
            <IoEllipsisHorizontal className="text-base" />
        </MusicContextMenu>
    );
}


// Memoized Background Component to prevent re-renders on progress/volume change
const BackgroundLayer = React.memo(({ src }: { src: string | null }) => {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden select-none pointer-events-none bg-[#1a1a1a]">
            {src && (
                <>
                    {/* Layer 1: Deep ambient blur - massive scale */}
                    <img
                        src={src}
                        alt=""
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[180vw] h-[180vh] max-w-none object-cover opacity-50 blur-[200px] saturate-[2.5]"
                    />
                    {/* Layer 2: Overlay for color richness */}
                    <img
                        src={src}
                        alt=""
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[140vw] h-[140vh] max-w-none object-cover opacity-60 blur-[150px] saturate-[2] mix-blend-screen brightness-90"
                    />
                </>
            )}
            {/* Gradient Overlay for legibility */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 z-10" />
        </div>
    );
});
