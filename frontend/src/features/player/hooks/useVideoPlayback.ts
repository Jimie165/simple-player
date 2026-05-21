import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveMediaPath } from '@/utils/mediaPath';
import { detectAv1Support, detectHevcSupport, detectSupportedAudioCodecs } from '@/features/player/utils/codecDetection';
import { buildVideoSrc, inferVideoMimeType, isMkvPath } from '@/features/player/utils/videoSource';
import { useMkvPrepare } from '@/features/player/hooks/useMkvPrepare';

type VideoMetadataLike = {
    path?: string;
    title?: string;
    duration?: number;
    thumbnail_path?: string | null;
    cover_path?: string | null;
} | null;

interface UseVideoPlaybackOptions {
    isOpen: boolean;
    metadata: VideoMetadataLike;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    volume: number;
    videoQueueLength: number;
    playPreviousVideo: () => void;
    playNextVideo: () => void;
    showControls: () => void;
    clearHideTimer: () => void;
    setIsControlsVisible: (value: boolean) => void;
    toggleAppFullscreen: () => void;
}

export function useVideoPlayback({
    isOpen,
    metadata,
    videoRef,
    volume,
    videoQueueLength,
    playPreviousVideo,
    playNextVideo,
    showControls,
    clearHideTimer,
    setIsControlsVisible,
    toggleAppFullscreen,
}: UseVideoPlaybackOptions) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showError, setShowError] = useState(false);
    const [isBuffering, setIsBuffering] = useState(true);
    const [posterUrl, setPosterUrl] = useState<string | undefined>(undefined);
    const lastClickTimeRef = useRef<number>(0);

    const isMkv = useMemo(() => isMkvPath(metadata?.path), [metadata?.path]);

    const supportsHevc = useMemo(() => detectHevcSupport(), []);
    const supportsAv1 = useMemo(() => detectAv1Support(), []);
    const supportedAudioCodecs = useMemo(() => detectSupportedAudioCodecs(), []);

    const {
        preparedPath,
        prepareStage,
        preparePercent,
        isPreparing,
    } = useMkvPrepare({
        isOpen,
        sourcePath: metadata?.path,
        isMkv,
        supportsHevc,
        supportsAv1,
        supportedAudioCodecs,
        onPrepareError: (prepareError) => {
            requestAnimationFrame(() => {
                setError(String(prepareError));
                setShowError(true);
            });
        },
    });

    const videoSrc = useMemo(() => {
        return buildVideoSrc(metadata?.path, preparedPath);
    }, [metadata?.path, preparedPath]);

    const videoMimeType = useMemo(() => {
        return inferVideoMimeType(metadata?.path, preparedPath);
    }, [metadata?.path, preparedPath]);

    useEffect(() => {
        let active = true;
        const loadPoster = async () => {
            if (!metadata) {
                if (active) requestAnimationFrame(() => setPosterUrl(undefined));
                return;
            }
            const path = metadata.thumbnail_path || metadata.cover_path;
            if (path) {
                try {
                    const url = await resolveMediaPath(path);
                    if (active && url) requestAnimationFrame(() => setPosterUrl(url));
                } catch (e) {
                    console.error('Failed to resolve poster:', e);
                }
            } else {
                if (active) requestAnimationFrame(() => setPosterUrl(undefined));
            }
        };
        loadPoster();
        return () => {
            active = false;
        };
    }, [metadata]);

    useEffect(() => {
        const srcReady = !isMkv || !!preparedPath;
        if (isOpen && metadata?.path && videoRef.current && srcReady) {
            const frame = requestAnimationFrame(() => setIsPlaying(true));
            videoRef.current.currentTime = 0;
            videoRef.current.load();
            videoRef.current.play().catch(() => setIsPlaying(false));
            return () => cancelAnimationFrame(frame);
        }
    }, [isOpen, metadata?.path, preparedPath, isMkv, videoRef]);

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
                case 'ArrowLeft': {
                    e.preventDefault();
                    const newTime = Math.max(0, videoRef.current.currentTime - 5);
                    videoRef.current.currentTime = newTime;
                    setCurrentTime(newTime);
                    showControls();
                    break;
                }
                case 'ArrowRight': {
                    e.preventDefault();
                    const d = videoRef.current.duration || duration || 0;
                    const newTime = Math.min(d, videoRef.current.currentTime + 5);
                    videoRef.current.currentTime = newTime;
                    setCurrentTime(newTime);
                    showControls();
                    break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, duration, showControls, setIsControlsVisible, videoRef]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.volume = volume / 100;
        }
    }, [volume, videoRef]);

    useEffect(() => {
        if (!isOpen || !metadata || !('mediaSession' in navigator)) return;

        const artwork: MediaImage[] = [];
        if (posterUrl) {
            artwork.push({
                src: posterUrl,
                sizes: '512x512',
                type: 'image/jpeg',
            });
        }

        navigator.mediaSession.metadata = new MediaMetadata({
            title: metadata.title || '未知视频',
            artist: 'Video',
            album: '',
            artwork,
        });

        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

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
            if (videoQueueLength > 1) {
                playPreviousVideo();
            }
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
            if (videoQueueLength > 1) {
                playNextVideo();
            }
        });

        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (videoRef.current && details.seekTime !== undefined) {
                videoRef.current.currentTime = details.seekTime;
                setCurrentTime(details.seekTime);
            }
        });

        const updatePositionState = () => {
            if (videoRef.current && !isNaN(videoRef.current.duration) && videoRef.current.duration > 0) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: videoRef.current.duration,
                        playbackRate: videoRef.current.playbackRate,
                        position: videoRef.current.currentTime,
                    });
                } catch {
                    // Ignore unsupported platforms
                }
            }
        };

        const positionInterval = setInterval(updatePositionState, 1000);
        updatePositionState();

        return () => {
            clearInterval(positionInterval);
            navigator.mediaSession.setActionHandler('play', null);
            navigator.mediaSession.setActionHandler('pause', null);
            navigator.mediaSession.setActionHandler('previoustrack', null);
            navigator.mediaSession.setActionHandler('nexttrack', null);
            navigator.mediaSession.setActionHandler('seekto', null);
        };
    }, [
        isOpen,
        metadata,
        isPlaying,
        videoQueueLength,
        playPreviousVideo,
        playNextVideo,
        posterUrl,
        videoRef,
    ]);

    const handleTogglePlay = useCallback(async () => {
        if (!videoRef.current) return;

        if (videoRef.current.paused) {
            await videoRef.current.play();
            setIsPlaying(true);
            showControls();
        } else {
            videoRef.current.pause();
            setIsPlaying(false);
            setIsControlsVisible(true);
        }
    }, [showControls, setIsControlsVisible, videoRef]);

    const handleSmartClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        handleTogglePlay();

        const now = Date.now();
        if (now - lastClickTimeRef.current < 250) {
            toggleAppFullscreen();
            lastClickTimeRef.current = 0;
        } else {
            lastClickTimeRef.current = now;
        }
    }, [handleTogglePlay, toggleAppFullscreen]);

    const onTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            if (!isDragging) {
                setCurrentTime(videoRef.current.currentTime);
            }

            if (error && videoRef.current.currentTime > 0.1 && !videoRef.current.paused) {
                setError(null);
            }
        }
    }, [error, isDragging, videoRef]);

    const onLoadedMetadata = useCallback(() => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration || metadata?.duration || 0);
        }
    }, [metadata?.duration, videoRef]);

    const onEnded = useCallback(() => {
        setIsPlaying(false);
        setIsControlsVisible(true);
    }, [setIsControlsVisible]);

    const handleSeekChange = useCallback((val: number) => {
        setCurrentTime(val);
        if (videoRef.current) {
            videoRef.current.currentTime = val;
        }
    }, [videoRef]);

    const handleSeekStart = useCallback(() => {
        setIsDragging(true);
        setIsControlsVisible(true);
        clearHideTimer();
    }, [clearHideTimer, setIsControlsVisible]);

    const handleSeekEnd = useCallback(() => {
        setIsDragging(false);
        if (videoRef.current && isPlaying) {
            showControls();
        }
    }, [isPlaying, showControls, videoRef]);

    const onLoadStart = useCallback(() => {
        setIsBuffering(true);
        setError(null);
        setShowError(false);
    }, []);

    const onWaiting = useCallback(() => {
        setIsBuffering(true);
    }, []);

    const onCanPlay = useCallback(() => {
        setIsBuffering(false);
    }, []);

    const onPlaying = useCallback(() => {
        setIsBuffering(false);
        setIsPlaying(true);
        if (error) {
            setError(null);
            setShowError(false);
        }
    }, [error]);

    const onError = useCallback((e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        const target = e.target as HTMLVideoElement;
        const err = target.error;
        let msg = '未知播放错误';
        if (err) {
            switch (err.code) {
                case 1:
                    msg = '取回过程被中止 (MEDIA_ERR_ABORTED)';
                    break;
                case 2:
                    msg = '下载时发生网络错误 (MEDIA_ERR_NETWORK)';
                    break;
                case 3:
                    msg = '解码错误 (MEDIA_ERR_DECODE)';
                    break;
                case 4:
                    msg = '不支持的视频格式 (MEDIA_ERR_SRC_NOT_SUPPORTED)';
                    break;
            }
        }
        console.error('Video Error:', err, 'Path:', metadata?.path);
        setError(msg);
        setTimeout(() => {
            if (videoRef.current && (videoRef.current.error || error)) {
                setShowError(true);
            }
        }, 500);
    }, [error, metadata?.path, videoRef]);

    return {
        isPlaying,
        setIsPlaying,
        currentTime,
        duration,
        isDragging,
        error,
        showError,
        isBuffering,
        preparedPath,
        prepareStage,
        preparePercent,
        isPreparing,
        posterUrl,
        isMkv,
        videoSrc,
        videoMimeType,
        handleTogglePlay,
        handleSmartClick,
        onTimeUpdate,
        onLoadedMetadata,
        onEnded,
        handleSeekChange,
        handleSeekStart,
        handleSeekEnd,
        onLoadStart,
        onWaiting,
        onCanPlay,
        onPlaying,
        onError,
    };
}
