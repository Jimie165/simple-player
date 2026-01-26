
import React, { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
    IoPlay, IoPause,
    IoShuffle, IoRepeat,
    IoVolumeLow, IoVolumeHigh,
    IoList, IoStar, IoStarOutline, IoEllipsisHorizontal,
    IoPlayBack, IoPlayForward
} from 'react-icons/io5';
import {
    MdPlaylistPlay, MdFavorite, MdFavoriteBorder, MdAlbum, MdPerson, MdInfo, MdPlaylistAdd
} from 'react-icons/md';

import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useNavigationStore } from '../../store/useNavigationStore';

import { usePlaybackActions } from '../../hooks/usePlaybackActions';
import { useSongOperations } from '../../hooks/useSongOperations';
import type { MenuItemData } from '../../hooks/useSongOperations';
import { audioService } from '../../services/audioService';
import { formatTime } from '../../utils/time';
import { resolveCover } from '../../utils/cover';
import CoverImage from '../../components/common/CoverImage';
import SmartCursorContextMenu from '../../components/common/SmartCursorContextMenu';
import MusicSlider from '../../components/common/MusicSlider';

export default function AppleMusicPlayer({ onClose }: { onClose: () => void }) {
    const {
        metadata, isPlaying, isShuffling, repeatMode,
        togglePlay, toggleShuffle, toggleRepeat
    } = usePlayerStore();

    const { toggleFavorite } = useLibraryStore();

    const { push } = useNavigationStore();
    const { playNext, playPrev, seek } = usePlaybackActions();

    // Local state for UI
    const [currentTime, setCurrentTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [bgImageSrc, setBgImageSrc] = useState<string | null>(null);

    // Get volume from store for consistency
    const { volume, setVolume } = usePlayerStore();

    // Layout sizing state
    const coverRef = useRef<HTMLDivElement>(null);
    const [contentWidth, setContentWidth] = useState<number | undefined>(undefined);

    useEffect(() => {
        if (!coverRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Use contentRect for precise sub-pixel values, or width/height
                setContentWidth(entry.contentRect.width);
            }
        });
        observer.observe(coverRef.current);
        return () => observer.disconnect();
    }, []);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

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

    // Progress Logic
    useEffect(() => {
        let interval: number;
        if (isPlaying && !isDragging) {
            interval = window.setInterval(() => {
                setCurrentTime((prev) => {
                    if (metadata && metadata.duration > 0 && prev >= metadata.duration - 0.5) return prev;
                    return prev + 0.5;
                });
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

    const lastCloseRef = React.useRef(0);

    // Background Image Source - already handled by state

    return (
        <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
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
            <div className="relative z-20 flex-1 flex flex-col items-center w-full min-h-0 px-8 pb-8 md:pb-12">

                {/* Content Wrapper: Controls vertical spacing */}
                <div className="w-full h-full max-w-[500px] flex flex-col gap-6 md:gap-8 justify-center items-center">

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
                        className="flex flex-col gap-2 flex-shrink-0 transition-[width] duration-100 ease-out"
                        style={{ width: contentWidth ? `${contentWidth}px` : '100%' }}
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
                                    className="w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/20 flex items-center justify-center text-white/50 hover:text-red-500 transition-all backdrop-blur-md"
                                >
                                    {metadata?.is_favorite ? <IoStar className="text-xl text-red-500" /> : <IoStarOutline className="text-xl" />}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const now = Date.now();
                                        if (now - lastCloseRef.current < 300) {
                                            return;
                                        }
                                        if (contextMenu) {
                                            setContextMenu(null);
                                        } else {
                                            setContextMenu({ x: e.clientX, y: e.clientY });
                                        }
                                    }}
                                    className={clsx(
                                        "w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/20 flex items-center justify-center transition-all backdrop-blur-md",
                                        contextMenu ? "text-white bg-white/20" : "text-white/50 hover:text-white"
                                    )}
                                >
                                    <IoEllipsisHorizontal className="text-base" />
                                </button>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="flex flex-col gap-1.5 mt-2">
                            {metadata && (
                                <MusicSlider
                                    value={currentTime}
                                    min={0}
                                    max={metadata.duration}
                                    onChange={handleSeekChange}
                                    onMouseDown={handleSeekStart}
                                    onMouseUp={handleSeekEnd}
                                    trackHeightClass="h-2"
                                    hoverHeightClass="group-hover:h-3.5"
                                    activeHeightClass="group-active:h-4"
                                />
                            )}
                            <div className="flex justify-between text-[11px] font-medium text-white/40 select-none">
                                <span>{formatTime(currentTime)}</span>
                                <span>-{formatTime((metadata?.duration || 0) - currentTime)}</span>
                            </div>
                        </div>

                        {/* Main Controls */}
                        <div className="flex items-center justify-between mt-2 px-2">
                            <button
                                onClick={toggleShuffle}
                                className={clsx(
                                    "p-2 rounded-lg transition-colors hover:bg-white/10",
                                    isShuffling ? "text-primary" : "text-white/40 hover:text-white"
                                )}
                            >
                                <IoShuffle className="text-xl" />
                            </button>

                            <button onClick={() => playPrev(currentTime)} className="text-white hover:opacity-70 transition-opacity p-2">
                                <IoPlayBack className="text-4xl" />
                            </button>

                            <button
                                onClick={togglePlay}
                                className="w-14 h-14 rounded-full bg-transparent text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all overflow-hidden"
                            >
                                {isPlaying ? <IoPause className="text-6xl" /> : <IoPlay className="text-6xl" />}
                            </button>

                            <button onClick={playNext} className="text-white hover:opacity-70 transition-opacity p-2">
                                <IoPlayForward className="text-4xl" />
                            </button>

                            <button
                                onClick={toggleRepeat}
                                className={clsx(
                                    "p-2 rounded-lg transition-colors relative hover:bg-white/10",
                                    repeatMode !== 'off' ? "text-primary" : "text-white/40 hover:text-white"
                                )}
                            >
                                {repeatMode === 'one' ? (
                                    <div className="relative">
                                        <IoRepeat className="text-xl" />
                                        <span className="absolute -top-1 -right-1 text-[8px] font-bold">1</span>
                                    </div>
                                ) : (
                                    <IoRepeat className="text-xl" />
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

            {/* Bottom Right Actions (Queue/Lyrics) */}
            <div className="absolute bottom-8 right-8 z-30">
                <button className="p-3 rounded-xl hover:bg-white/10 hover:text-white transition-all text-white/60">
                    <IoList className="text-xl" />
                </button>
            </div>

            {/* Render Context Menu if active */}
            {contextMenu && metadata && (
                <AppleStyleContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    metadata={metadata}
                    onClose={() => {
                        lastCloseRef.current = Date.now();
                        setContextMenu(null);
                    }}
                />
            )}
        </motion.div >
    );
}

// Sub-component for Menu Logic to keep main component clean
function AppleStyleContextMenu({ x, y, metadata, onClose }: { x: number, y: number, metadata: any, onClose: () => void }) {
    // We need to use useSongOperations to get the actions
    // But we want to structure them customly.
    // Actually, useSongOperations returns prepared menuItems.
    // We might want to construct our own list using the HANDLERS from useSongOperations.

    // Wrap metadata in array for hook
    const items = React.useMemo(() => [metadata], [metadata]);

    const {
        handleAddToPlaylist,
        handleAddToQueue,
        handleFavorite,
        handleProperties
    } = useSongOperations({ items, context: 'other', hideSelect: true });

    // Custom Navigation Handlers 
    // (We duplicate navigation logic slightly here because useSongOperations navigation might not close the fullscreen player, 
    // although we could pass a custom onSelect/Close to it, but manual construction is safer for specific Apple Layout)
    const { push } = useNavigationStore();

    const goToAlbum = () => {
        if (metadata.album) {
            push({ type: 'album_detail', data: { name: metadata.album, artist: metadata.artist, songs: [], cover: metadata.cover || null, count: 0 } });
            // Close player is handled by parent if needed? 
            // Actually usually clicking "Go to Album" should close the player to show the album.
            // But AppleMusicPlayer `onClose` is passed from parent.
            // We can't easily close it from here without prop drilling.
            // Let's rely on the user manually closing or we can dispatch the close event we used before?
            // Wait, previous step we made `onClose` work via props.
            // Let's just Dispatch 'close-fullscreen-player' as a failsafe or accept that updated navigation might not auto-close.
            // User request "Go to Album" implies standard navigation behavior. 
            // Standard behavior in App is `handleNavigate` -> `setIsFullScreen(false)`.
            // `push` updates store, but doesn't auto-close fullscreen in App.tsx unless we trigger it.
            // Let's trigger the event we set up in App.tsx: 'close-fullscreen-player'.
            window.dispatchEvent(new CustomEvent('close-fullscreen-player'));
        }
    };

    const goToArtist = () => {
        if (metadata.artist) {
            push({ type: 'artist_detail', data: { name: metadata.artist, count: 0, albumCount: 0, songs: [], cover: null } });
            window.dispatchEvent(new CustomEvent('close-fullscreen-player'));
        }
    };

    // Icons are imported at module level

    // Construct Groups
    const menuGroups: MenuItemData[][] = [
        [
            { id: 'add-to', label: '添加到播放列表...', icon: MdPlaylistAdd, onClick: handleAddToPlaylist },
            { id: 'queue', label: '加入播放队列', icon: MdPlaylistPlay, onClick: handleAddToQueue },
        ],
        [
            { id: 'artist', label: '前往艺人', icon: MdPerson, onClick: goToArtist },
            ...(metadata.album ? [{ id: 'album', label: '前往专辑', icon: MdAlbum, onClick: goToAlbum }] : [])
        ],
        [
            {
                id: 'favorite',
                label: metadata.is_favorite ? '取消喜爱' : '喜爱',
                icon: metadata.is_favorite ? MdFavorite : MdFavoriteBorder,
                onClick: handleFavorite
            }
        ],
        [
            { id: 'properties', label: '属性', icon: MdInfo, onClick: handleProperties }
        ]
    ];

    return (
        <SmartCursorContextMenu
            x={x}
            y={y}
            onClose={onClose}
            menuGroups={menuGroups}
            variant="apple"
            placement="top"
        />
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
