import { useState, useEffect, useMemo, useRef } from 'react';

import { usePlayerStore } from '@/store/usePlayerStore';
import { formatTime } from '@/utils/time';
import {
    MdPlayArrow, MdPause,
    MdVolumeUp, MdVolumeOff, MdFullscreen, MdFullscreenExit,
    MdArrowBack, MdSkipPrevious, MdSkipNext, MdPlaylistPlay, MdClose
} from 'react-icons/md';
import { AnimatePresence, motion } from 'framer-motion';
import MusicSlider from '@/components/common/MusicSlider';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { systemService } from '@/services/systemService';
import { VscChromeMinimize, VscChromeMaximize, VscChromeRestore, VscChromeClose } from 'react-icons/vsc';

export default function VideoPlayerOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { videoMetadata, videoQueue, currentVideoIndex, playNextVideo, playPreviousVideo, setVideoQueue } = usePlayerStore();

    // Video Play State (Independent from Music)
    const [isPlaying, setIsPlaying] = useState(false);

    // UI State
    const [isControlsVisible, setIsControlsVisible] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [isCompact, setIsCompact] = useState(false);
    const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

    useEffect(() => {
        const checkMaximized = async () => setIsMaximized(await systemService.isMaximized());
        checkMaximized();
        const unlisten = systemService.onResize(checkMaximized);
        return () => { unlisten.then(f => f && f()); };
    }, []);

    useEffect(() => {
        const updateCompact = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            setIsCompact(w < 520 || h < 360);
        };

        updateCompact();
        window.addEventListener('resize', updateCompact);
        const unlisten = systemService.onResize(updateCompact);

        return () => {
            window.removeEventListener('resize', updateCompact);
            unlisten.then(f => f && f());
        };
    }, []);

    const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastClickTimeRef = useRef<number>(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [showError, setShowError] = useState(false);
    const [isBuffering, setIsBuffering] = useState(true);
    const [preparedPath, setPreparedPath] = useState<string | null>(null);
    const [prepareStage, setPrepareStage] = useState<string | null>(null);
    const [preparePercent, setPreparePercent] = useState<number | null>(null);
    const [isPreparing, setIsPreparing] = useState(false);

    // Use videoMetadata instead of global metadata
    const metadata = videoMetadata;
    const isMkv = useMemo(() => (metadata?.path ?? '').toLowerCase().endsWith('.mkv'), [metadata?.path]);

    const videoSrc = useMemo(() => {
        if (!metadata?.path) return '';
        const p = preparedPath ?? metadata.path;
        return convertFileSrc(p, 'asset');
    }, [metadata?.path, preparedPath]);

    const videoMimeType = useMemo(() => {
        const p = (preparedPath ?? metadata?.path ?? '').toLowerCase();
        if (p.endsWith('.mp4')) return 'video/mp4';
        if (p.endsWith('.webm')) return 'video/webm';
        if (p.endsWith('.mov')) return 'video/quicktime';
        if (p.endsWith('.avi')) return 'video/x-msvideo';
        if (p.endsWith('.mkv')) return 'video/x-matroska';
        if (p.endsWith('.flv')) return 'video/x-flv';
        return undefined;
    }, [metadata?.path, preparedPath]);

    const autoHideEnabled = true;

    // Auto-hide controls
    const showControls = () => {
        setIsControlsVisible(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);

        if (isOpen && autoHideEnabled) {
            controlsTimeoutRef.current = setTimeout(() => {
                if (!isDragging && isPlaying) {
                    setIsControlsVisible(false);
                }
            }, 3000);
        }
    };

    // 使用全局事件监听器确保鼠标/指针活动都能触发控件显示
    useEffect(() => {
        if (!isOpen) return;

        const onGlobalActivity = () => {
            showControls();
        };

        const options: AddEventListenerOptions = { capture: true, passive: true };
        window.addEventListener('mousemove', onGlobalActivity, options);
        window.addEventListener('pointermove', onGlobalActivity, options);
        window.addEventListener('mouseenter', onGlobalActivity, options);
        window.addEventListener('pointerdown', onGlobalActivity, options);
        window.addEventListener('focus', onGlobalActivity, options);

        return () => {
            window.removeEventListener('mousemove', onGlobalActivity, options);
            window.removeEventListener('pointermove', onGlobalActivity, options);
            window.removeEventListener('mouseenter', onGlobalActivity, options);
            window.removeEventListener('pointerdown', onGlobalActivity, options);
            window.removeEventListener('focus', onGlobalActivity, options);
        };
    }, [isOpen, isDragging, isPlaying, isCompact]);

    useEffect(() => {
        let unlistenFn: null | (() => void) = null;
        let cancelled = false;

        const run = async () => {
            if (!isOpen || !metadata?.path || !isMkv) {
                setPreparedPath(null);
                setIsPreparing(false);
                setPrepareStage(null);
                setPreparePercent(null);
                return;
            }

            setPreparedPath(null);
            setIsPreparing(true);
            setPrepareStage('start');
            setPreparePercent(null);
            setError(null);

            unlistenFn = await listen<{ path: string; stage: string; percent?: number; message?: string }>(
                'video:prepare-progress',
                (event) => {
                    if (event.payload.path !== metadata.path) return;
                    setPrepareStage(event.payload.stage);
                    setPreparePercent(event.payload.percent ?? null);
                }
            );

            try {
                const outPath = await invoke<string>('prepare_video_for_playback', { path: metadata.path });
                if (cancelled) return;
                setPreparedPath(outPath);
            } catch (e) {
                if (cancelled) return;
                setError(String(e));
            } finally {
                if (cancelled) return;
                setIsPreparing(false);
            }
        };

        run();

        return () => {
            cancelled = true;
            if (unlistenFn) unlistenFn();
        };
    }, [isOpen, metadata?.path, isMkv]);

    // Auto Play when opened with new metadata
    useEffect(() => {
        const srcReady = !isMkv || !!preparedPath;
        if (isOpen && metadata?.path && videoRef.current && srcReady) {
            // Reset state
            setIsPlaying(true);
            videoRef.current.currentTime = 0;
            videoRef.current.load();
            videoRef.current.play().catch(() => setIsPlaying(false));
        }
    }, [isOpen, metadata?.path, preparedPath, isMkv]);

    // Keyboard Shortcuts
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!videoRef.current) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    if (videoRef.current.paused) {
                        videoRef.current.play();
                        setIsPlaying(true);
                        showControls();
                    } else {
                        videoRef.current.pause();
                        setIsPlaying(false);
                        setIsControlsVisible(true);
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    // Seek back 5s
                    if (videoRef.current) {
                        const newTime = Math.max(0, videoRef.current.currentTime - 5);
                        videoRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                        showControls();
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    // Seek forward 5s
                    if (videoRef.current) {
                        // Use current video duration directly
                        const d = videoRef.current.duration || duration || 0;
                        const newTime = Math.min(d, videoRef.current.currentTime + 5);
                        videoRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                        showControls();
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, duration]); // Re-bind if duration changes, though videoRef.duration is safer source of truth


    // Close Logic
    const handleClose = async () => {
        if (videoRef.current) {
            videoRef.current.pause();
            setIsPlaying(false);
        }

        // Clear MediaSession when closing video player
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.playbackState = 'none';
        }

        // Exit fullscreen if needed
        const win = getCurrentWindow();
        if (await win.isFullscreen()) {
            await win.setFullscreen(false);
            setIsFullscreen(false);
        }

        onClose();
    };


    // Local Play Control
    const handleTogglePlay = async () => {
        if (!videoRef.current) return;

        if (videoRef.current.paused) {
            await videoRef.current.play();
            setIsPlaying(true);
            showControls(); // Restart hide timer
        } else {
            videoRef.current.pause();
            setIsPlaying(false);
            setIsControlsVisible(true); // Always show controls when paused
        }
    };

    const handleSmartClick = (e: React.MouseEvent) => {
        // Always toggle play immediately
        e.stopPropagation();
        handleTogglePlay();

        const now = Date.now();
        // Check for double click with tighter threshold (250ms)
        if (now - lastClickTimeRef.current < 250) {
            toggleAppFullscreen();
            lastClickTimeRef.current = 0; // Prevent triple-click triggering again
        } else {
            lastClickTimeRef.current = now;
        }
    };

    // Video Events
    const onTimeUpdate = () => {
        if (videoRef.current) {
            if (!isDragging) {
                setCurrentTime(videoRef.current.currentTime);
            }

            // If video is actually playing (progressing), clear any false-positive errors
            if (error && videoRef.current.currentTime > 0.1 && !videoRef.current.paused) {
                setError(null);
            }
        }
    };

    const onLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration || metadata?.duration || 0);
        }
    };

    const onEnded = () => {
        setIsPlaying(false);
        setIsControlsVisible(true);
    };


    // Seek
    const handleSeekChange = (val: number) => {
        setCurrentTime(val);
        if (videoRef.current) {
            videoRef.current.currentTime = val;
        }
    };

    const handleSeekStart = () => {
        setIsDragging(true);
        setIsControlsVisible(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };

    const handleSeekEnd = () => {
        setIsDragging(false);
        if (videoRef.current && isPlaying) {
            showControls();
        }
    };

    // Volume Sync (Optional: Sync video volume with global volume because we don't carry separate video volume)
    // Actually, we can just use the global volume state but NOT set global volume if we want.
    // Ideally video player should have its own volume or share system volume. Sharing is fine.
    // But modifying volume here will modify global music volume too. Accepted behavior for now?
    // User said "separate", but volume is usually global for the app. I'll keep it shared.
    const { volume, setVolume } = usePlayerStore();
    const useNativeControls = isCompact;
    const videoFitClass = 'object-contain';

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.volume = volume / 100;
        }
    }, [volume]);

    // MediaSession API for Video (SMTC on Windows, media controls on other platforms)
    useEffect(() => {
        if (!isOpen || !metadata || !('mediaSession' in navigator)) return;

        // Set metadata
        const artwork: MediaImage[] = [];
        if (metadata.cover_path) {
            artwork.push({
                src: convertFileSrc(metadata.cover_path),
                sizes: '512x512',
                type: 'image/jpeg'
            });
        }

        navigator.mediaSession.metadata = new MediaMetadata({
            title: metadata.title || '未知视频',
            artist: 'Video',
            album: '',
            artwork
        });

        // Set playback state
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

        // Set action handlers
        navigator.mediaSession.setActionHandler('play', () => {
            if (videoRef.current) {
                videoRef.current.play();
                setIsPlaying(true);
            }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            if (videoRef.current) {
                videoRef.current.pause();
                setIsPlaying(false);
            }
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
            if (videoQueue.length > 1) {
                playPreviousVideo();
            }
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
            if (videoQueue.length > 1) {
                playNextVideo();
            }
        });

        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (videoRef.current && details.seekTime !== undefined) {
                videoRef.current.currentTime = details.seekTime;
                setCurrentTime(details.seekTime);
            }
        });

        // Update position state periodically
        const updatePositionState = () => {
            if (videoRef.current && !isNaN(videoRef.current.duration) && videoRef.current.duration > 0) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: videoRef.current.duration,
                        playbackRate: videoRef.current.playbackRate,
                        position: videoRef.current.currentTime
                    });
                } catch (e) {
                    // Ignore errors (some browsers don't support this)
                }
            }
        };

        const positionInterval = setInterval(updatePositionState, 1000);
        updatePositionState();

        return () => {
            clearInterval(positionInterval);
            // Clear action handlers when video player closes
            navigator.mediaSession.setActionHandler('play', null);
            navigator.mediaSession.setActionHandler('pause', null);
            navigator.mediaSession.setActionHandler('previoustrack', null);
            navigator.mediaSession.setActionHandler('nexttrack', null);
            navigator.mediaSession.setActionHandler('seekto', null);
        };
    }, [isOpen, metadata, isPlaying, videoQueue.length, playPreviousVideo, playNextVideo]);


    const toggleAppFullscreen = async () => {
        const win = getCurrentWindow();
        const isFull = await win.isFullscreen();

        if (!isFull) {
            // Fix: If maximized, unmaximize first to ensure taskbar is covered
            if (await win.isMaximized()) {
                await win.unmaximize();
                // Update local state locally since resize event might lag
                setIsMaximized(false);
            }
            await win.setFullscreen(true);
            setIsFullscreen(true);
        } else {
            await win.setFullscreen(false);
            setIsFullscreen(false);
        }
    };


    if (!isOpen || !metadata) return null;

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`fixed inset-0 z-[100] bg-black grid grid-cols-1 grid-rows-1 overflow-hidden group select-none isolate ${!isControlsVisible ? 'cursor-none' : ''}`}
                data-controls-visible={isControlsVisible}
                onMouseMove={showControls}
                onMouseLeave={() => {
                    if (autoHideEnabled) {
                        setIsControlsVisible(false);
                    }
                }}
                onClick={() => setIsControlsVisible(true)}
                onMouseEnter={showControls}
            >
                {/* 1. Video Layer */}
                <video
                    ref={videoRef}
                    key={videoSrc}
                    className={`col-start-1 row-start-1 w-full h-full max-w-full max-h-full ${videoFitClass} object-center z-0`}
                    controls={useNativeControls}
                    controlsList={useNativeControls ? "nodownload" : undefined}
                    poster={metadata.cover_path ? convertFileSrc(metadata.cover_path, 'asset') : undefined}
                    onTimeUpdate={onTimeUpdate}
                    onLoadedMetadata={onLoadedMetadata}
                    onEnded={onEnded}
                    onLoadStart={() => {
                        setIsBuffering(true);
                        setError(null);
                        setShowError(false);
                    }}
                    onWaiting={() => setIsBuffering(true)}
                    onCanPlay={() => setIsBuffering(false)}
                    onPlaying={() => {
                        setIsBuffering(false);
                        setIsPlaying(true);
                        if (error) {
                            setError(null);
                            setShowError(false);
                        }
                    }}
                    onError={(e) => {
                        const target = e.target as HTMLVideoElement;
                        const err = target.error;
                        let msg = "未知播放错误";
                        if (err) {
                            switch (err.code) {
                                case 1: msg = "取回过程被中止 (MEDIA_ERR_ABORTED)"; break;
                                case 2: msg = "下载时发生网络错误 (MEDIA_ERR_NETWORK)"; break;
                                case 3: msg = "解码错误 (MEDIA_ERR_DECODE)"; break;
                                case 4: msg = "不支持的视频格式 (MEDIA_ERR_SRC_NOT_SUPPORTED)"; break;
                            }
                        }
                        console.error("Video Error:", err, "Path:", metadata.path);
                        setError(msg);
                        setTimeout(() => {
                            if (videoRef.current && (videoRef.current.error || error)) {
                                setShowError(true);
                            }
                        }, 500);
                    }}
                    onClick={handleSmartClick}
                >
                    {videoSrc ? <source src={videoSrc} type={videoMimeType} /> : null}
                </video>

                {/* 2. Status / Loading Overlays */}
                {/* Loading / Buffering Spinner */}
                {isBuffering && !error && (
                    <div className="col-start-1 row-start-1 w-full h-full z-40 flex items-center justify-center pointer-events-none">
                        <div className="w-16 h-16 border-4 border-white/20 border-t-red-600 rounded-full animate-spin duration-700"></div>
                    </div>
                )}

                {/* Preparing Overlay */}
                {isPreparing && (
                    <div className="col-start-1 row-start-1 w-full h-full z-40 flex flex-col items-center justify-center bg-black/70 text-white pointer-events-none">
                        <div className="text-lg font-medium mb-2">正在准备播放</div>
                        <div className="text-white/70 text-sm">
                            {prepareStage ? `阶段：${prepareStage}` : null}
                            {preparePercent !== null ? `  ${Math.round(preparePercent)}%` : null}
                        </div>
                    </div>
                )}

                {/* Error Overlay */}
                {error && showError && (
                    <div className="col-start-1 row-start-1 w-full h-full z-50 flex flex-col items-center justify-center bg-black/90 text-white pointer-events-auto">
                        <div className="text-red-500 text-5xl mb-4">⚠️</div>
                        <div className="text-xl font-bold mb-2">无法播放视频</div>
                        <div className="text-white/70 mb-6 px-8 text-center">{error}</div>
                        {metadata.path?.endsWith('.mkv') && (
                            <div className="text-yellow-400 text-sm bg-yellow-400/10 px-4 py-2 rounded-lg border border-yellow-400/20 mb-6">
                                提示：浏览器内核通常不支持原生播放 MKV 格式。
                            </div>
                        )}
                        {metadata.path?.toLowerCase().endsWith('.mp4') && (
                            <div className="text-yellow-400 text-sm bg-yellow-400/10 px-4 py-2 rounded-lg border border-yellow-400/20 mb-6">
                                提示：MP4 只是封装格式。如果使用了 HEVC/H.265 等编码，WebView 内核可能不支持，建议导出为 H.264/AVC + AAC。
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                        >
                            关闭播放器
                        </button>
                    </div>
                )}

                {/* 3. Controls Layer */}
                <div className="col-start-1 row-start-1 w-full h-full z-10 flex flex-col justify-between pointer-events-none">
                    {/* Top Bar */}
                    <motion.div
                        initial={false}
                        animate={{ opacity: isControlsVisible ? 1 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="h-20 bg-gradient-to-b from-black/70 to-transparent flex items-start justify-between p-4 pointer-events-auto relative"
                    >
                        {/* Drag Region for Window Move */}
                        <div className="absolute inset-0 z-0" data-tauri-drag-region />

                        {/* Left: Back + Title */}
                        <div className="flex items-center gap-4 z-30 mr-4 min-w-0 flex-1">
                            <button
                                onClick={handleClose}
                                className="p-2 rounded-full hover:bg-white/10 text-white transition-colors"
                            >
                                <MdArrowBack className="text-2xl" />
                            </button>
                            <div className="min-w-0 flex-1">
                                <h1 className="text-lg font-medium text-white leading-tight line-clamp-1 drop-shadow-md select-text truncate">
                                    {metadata.title}
                                </h1>
                            </div>
                        </div>

                        {/* Right: Window Controls */}
                        {!isFullscreen && (
                            <div className="flex items-start gap-1 z-30 shrink-0 -mt-1 -mr-2">
                                <button
                                    onClick={systemService.minimize}
                                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                                >
                                    <VscChromeMinimize className="text-xl" />
                                </button>
                                <button
                                    onClick={systemService.toggleMaximize}
                                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                                >
                                    {isMaximized ? <VscChromeRestore className="text-xl" /> : <VscChromeMaximize className="text-xl" />}
                                </button>
                                <button
                                    onClick={systemService.close}
                                    className="p-2 text-white/80 hover:text-white hover:bg-red-500 rounded-full transition-colors"
                                >
                                    <VscChromeClose className="text-xl" />
                                </button>
                            </div>
                        )}
                    </motion.div>

                    {/* Drag Region (Center filling space) -> Now Click Region */}
                    <div className="flex-1 w-full pointer-events-auto"
                        onClick={handleSmartClick}
                    />

                    {/* Bottom Controls */}
                    {!useNativeControls && (
                        <motion.div
                            initial={false}
                            animate={{ opacity: isControlsVisible ? 1 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="pointer-events-auto"
                        >
                            <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-10 pb-2 px-3 overflow-x-auto">

                                {/* Progress Bar */}
                                <div className="w-full group/slider mb-1 px-1 h-4 flex items-end">
                                    <MusicSlider
                                        value={currentTime}
                                        min={0}
                                        max={duration || metadata.duration}
                                        onChange={handleSeekChange}
                                        onMouseDown={handleSeekStart}
                                        onMouseUp={handleSeekEnd}
                                        fillColor="bg-[#f00]"
                                        trackColor="bg-white/20"
                                        trackHeightClass="h-[2px]"
                                        hoverHeightClass="group-hover/slider:h-[4px]"
                                        activeHeightClass="group-hover/slider:h-[4px]"
                                        thumbClassName="text-[#f00] opacity-0 group-hover/slider:opacity-100 scale-100 transition-[opacity,transform] duration-100"
                                    />
                                </div>

                                {/* Controls Row */}
                                <div className="w-full flex items-center justify-between h-12 min-w-[280px]">

                                    {/* LEFT */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        {/* Prev Button */}
                                        {currentVideoIndex > 0 && (
                                            <button
                                                onClick={playPreviousVideo}
                                                className="p-2 text-white hover:text-white/90 transition-colors"
                                                title="上一个"
                                            >
                                                <MdSkipPrevious className="text-3xl" />
                                            </button>
                                        )}

                                        {/* Play/Pause */}
                                        <button
                                            onClick={handleTogglePlay}
                                            className="p-2 text-white hover:text-white/90 transition-colors"
                                        >
                                            {isPlaying ? <MdPause className="text-3xl" /> : <MdPlayArrow className="text-3xl" />}
                                        </button>

                                        {/* Next Button */}
                                        {currentVideoIndex < videoQueue.length - 1 && (
                                            <button
                                                onClick={playNextVideo}
                                                className="p-2 text-white hover:text-white/90 transition-colors"
                                                title="下一个"
                                            >
                                                <MdSkipNext className="text-3xl" />
                                            </button>
                                        )}

                                        {/* Volume */}
                                        <div className="flex items-center gap-1 group/vol ml-2">
                                            <button
                                                onClick={() => setVolume(volume === 0 ? 100 : 0)}
                                                className="p-2 text-white/90 hover:text-white"
                                            >
                                                {volume === 0 ? <MdVolumeOff className="text-2xl" /> : <MdVolumeUp className="text-2xl" />}
                                            </button>
                                            <div className="w-0 overflow-hidden group-hover/vol:w-24 transition-all duration-300 ease-out flex items-center">
                                                <div className="w-20 pl-2">
                                                    <MusicSlider
                                                        value={volume}
                                                        min={0}
                                                        max={100}
                                                        onChange={setVolume}
                                                        trackHeightClass="h-[2px]"
                                                        hoverHeightClass="h-[2px]"
                                                        activeHeightClass="h-[2px]"
                                                        fillColor="bg-white"
                                                        trackColor="bg-white/20"
                                                        thumbClassName="text-white scale-100 opacity-0 group-hover/vol:opacity-100 transition-opacity duration-200"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Time Display */}
                                        <div className="text-xs font-medium text-white/90 ml-3 font-mono tracking-wide hidden sm:block">
                                            {formatTime(currentTime)} <span className="text-white/50">/</span> {formatTime(duration || metadata.duration)}
                                        </div>
                                    </div>

                                    {/* RIGHT */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => setIsPlaylistOpen(!isPlaylistOpen)}
                                            className={`p-2 transition-colors ${isPlaylistOpen ? 'text-primary' : 'text-white/90 hover:text-white'}`}
                                            title="播放列表"
                                        >
                                            <MdPlaylistPlay className="text-2xl" />
                                        </button>
                                        <button onClick={toggleAppFullscreen} className="p-2 text-white/90 hover:text-white transition-colors">
                                            {isFullscreen ? <MdFullscreenExit className="text-2xl" /> : <MdFullscreen className="text-2xl" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* 4. Playlist Drawer */}
                <AnimatePresence>
                    {isPlaylistOpen && (
                        <>
                            {/* Backdrop - Click to Close */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-[60]"
                                onClick={() => setIsPlaylistOpen(false)}
                            />

                            {/* Drawer */}
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="absolute top-0 right-0 h-full w-80 bg-black/80 backdrop-blur-xl border-l border-white/10 z-[70] flex flex-col shadow-2xl pointer-events-auto"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between p-4 border-b border-white/10">
                                    <h2 className="text-white font-medium text-lg">播放列表</h2>
                                    <button
                                        onClick={() => setIsPlaylistOpen(false)}
                                        className="p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                                    >
                                        <MdClose className="text-xl" />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                                    {videoQueue.map((video, index) => (
                                        <div
                                            key={video.id + '_' + index}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setVideoQueue(videoQueue, index);
                                            }}
                                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors group/item ${index === currentVideoIndex
                                                ? 'bg-primary/20 hover:bg-primary/30'
                                                : 'hover:bg-white/5'
                                                }`}
                                        >
                                            {/* Thumbnail or Icon */}
                                            <div className="w-16 aspect-video bg-black/40 rounded overflow-hidden shrink-0 relative">
                                                {video.cover_path ? (
                                                    <img src={convertFileSrc(video.cover_path, 'asset')} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white/20">
                                                        <MdPlayArrow />
                                                    </div>
                                                )}
                                                {index === currentVideoIndex && (
                                                    <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                                                        <div className="w-2 h-2 bg-primary animate-pulse rounded-full" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className={`text-sm font-medium truncate ${index === currentVideoIndex ? 'text-primary' : 'text-white/90'}`}>
                                                    {video.title}
                                                </div>
                                                <div className="text-xs text-white/50 truncate">
                                                    {formatTime(video.duration)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

            </motion.div>

        </>
    );
}
