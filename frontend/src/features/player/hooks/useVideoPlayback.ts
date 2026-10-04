import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { usePlayerStore } from '@/store/usePlayerStore';
import { mediaControlService } from '@/services/mediaControlService';
import type { SystemMediaAction } from '@/services/mediaControlService';
import { resolveMediaPath } from '@/utils/mediaPath';
import { detectAv1Support, detectHevcSupport, detectSupportedAudioCodecs } from '@/features/player/utils/codecDetection';
import { buildVideoSrc, inferVideoMimeType, isMkvPath } from '@/features/player/utils/videoSource';
import { useMkvPrepare } from '@/features/player/hooks/useMkvPrepare';
import { useVideoStore } from '@/store/useVideoStore';
import { videoService } from '@/services/videoService';
import { handleMissingVideo } from '@/features/player/video/handleMissingVideo';

type VideoMetadataLike = {
    id?: number;
    path?: string;
    title?: string;
    duration?: number;
    thumbnail_path?: string | null;
    cover_path?: string | null;
} | null;

interface UseVideoPlaybackOptions {
    isOpen: boolean;
    isFullscreen: boolean;
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
    isFullscreen,
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
    const [poster, setPoster] = useState<{ source: string; cover: string; url: string } | null>(null);
    const libraryThumbnail = useVideoStore(state => state.videos.find(video => video.path === metadata?.path)?.thumbnail_path);
    const coverPath = libraryThumbnail || metadata?.thumbnail_path || metadata?.cover_path || null;
    const posterUrl = poster?.source === metadata?.path && poster?.cover === coverPath ? poster?.url : undefined;
    const lastClickTimeRef = useRef<number>(0);
    const activeVideoPathRef = useRef<string | undefined>(undefined);
    const videoRequestIdRef = useRef(0);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const requestId = ++videoRequestIdRef.current;
        activeVideoPathRef.current = isOpen ? metadata?.path : undefined;
        return () => {
            videoRequestIdRef.current = requestId + 1;
            activeVideoPathRef.current = undefined;
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        };
    }, [isOpen, metadata?.path]);

    const handleVideoFailure = useCallback(async (failure: unknown, message: string, immediate = false) => {
        const path = metadata?.path;
        const requestId = videoRequestIdRef.current;
        if (!path) return;
        let missing = failure instanceof Error && failure.message === 'VIDEO_FILE_NOT_FOUND';
        if (!missing) {
            try {
                missing = !await videoService.fileExists(path);
            } catch (checkError) {
                console.error('Failed to check video file', checkError);
            }
        }
        // The user may have switched videos or closed the player during the check.
        if (activeVideoPathRef.current !== path || videoRequestIdRef.current !== requestId) return;
        setIsBuffering(false);
        setIsPlaying(false);
        setError(missing ? '找不到视频文件' : message);
        if (missing) handleMissingVideo({ ...metadata, path });
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        if (missing || immediate) {
            setShowError(true);
        } else {
            errorTimerRef.current = setTimeout(() => {
                if (activeVideoPathRef.current === path && videoRef.current?.error) setShowError(true);
            }, 500);
        }
    }, [metadata, videoRef]);

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
            void handleVideoFailure(prepareError, String(prepareError), true);
        },
    });

    const videoSrc = useMemo(() => {
        return preparedPath ? buildVideoSrc(metadata?.path, preparedPath) : '';
    }, [metadata?.path, preparedPath]);

    const videoMimeType = useMemo(() => {
        return inferVideoMimeType(metadata?.path, preparedPath);
    }, [metadata?.path, preparedPath]);

    useEffect(() => {
        let active = true;
        const source = metadata?.path;
        if (source && coverPath) {
            void resolveMediaPath(coverPath).then(url => {
                if (active && url) setPoster({ source, cover: coverPath, url });
            }).catch(console.error);
        }
        return () => { active = false; };
    }, [metadata?.path, coverPath]);

    useEffect(() => {
        const srcReady = !!preparedPath;
        if (isOpen && metadata?.path && videoRef.current && srcReady) {
            videoRef.current.currentTime = 0;
            videoRef.current.load();
            const video = videoRef.current;
            let active = true;
            void video.play().catch(() => { if (active) setIsPlaying(false); });
            return () => { active = false; };
        }
    }, [isOpen, metadata?.path, preparedPath, isMkv, videoRef]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!videoRef.current) return;

            switch (e.code) {
                case 'Escape':
                    if (!isFullscreen) break;
                    e.preventDefault();
                    void toggleAppFullscreen();
                    break;
                case 'Space':
                    e.preventDefault();
                    if (videoRef.current.paused) {
                        videoRef.current.play();
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
    }, [isOpen, isFullscreen, duration, showControls, setIsControlsVisible, videoRef, toggleAppFullscreen]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.volume = volume / 100;
        }
    }, [volume, videoRef]);

    const systemPosition = isPlaying && !isDragging ? Math.floor(currentTime) : currentTime;
    useEffect(() => {
        if (!isOpen || !metadata) {
            void mediaControlService.updateVideo(null, false, 0).catch(console.error);
            return;
        }
        void mediaControlService.updateVideo({
            title: metadata.title || '未知视频',
            artist: 'Video',
            album: '',
            cover_path: coverPath,
            duration: duration || metadata.duration || 0,
        }, isPlaying, systemPosition).catch(console.error);
    }, [isOpen, metadata, coverPath, duration, isPlaying, systemPosition]);

    useEffect(() => {
        if (!isOpen) return;
        let disposed = false;
        const unlisten: Array<() => void> = [];
        const handleAction = ({ action, position }: SystemMediaAction) => {
            const video = videoRef.current;
            if (disposed || !video || usePlayerStore.getState().mediaKind !== 'video') return;
            switch (action) {
                case 'play':
                case 'toggle':
                    if (action === 'play' || video.paused) {
                        void video.play().catch(console.error);
                        break;
                    }
                    video.pause();
                    setIsPlaying(false);
                    break;
                case 'pause':
                    video.pause();
                    setIsPlaying(false);
                    break;
                case 'next': if (videoQueueLength > 1) playNextVideo(); break;
                case 'previous': if (videoQueueLength > 1) playPreviousVideo(); break;
                case 'seek':
                    if (position !== null && Number.isFinite(position)) {
                        video.currentTime = Math.max(0, Math.min(position, video.duration || position));
                        setCurrentTime(video.currentTime);
                    }
            }
        };
        const register = async <T,>(event: string, handler: (payload: T) => void) => {
            const cleanup = await listen<T>(event, ({ payload }) => {
                if (!disposed) handler(payload);
            });
            if (disposed) cleanup();
            else unlisten.push(cleanup);
        };
        for (const action of ['play', 'pause', 'next', 'previous'] as const) {
            void register(`smtc:${action}`, () => handleAction({ action, position: null })).catch(console.error);
        }
        void register<number>('smtc:seek', (position) => handleAction({ action: 'seek', position })).catch(console.error);
        return () => { disposed = true; unlisten.forEach(cleanup => cleanup()); };
    }, [isOpen, videoRef, videoQueueLength, playNextVideo, playPreviousVideo]);

    const handleTogglePlay = useCallback(async () => {
        if (!videoRef.current) return;

        if (videoRef.current.paused) {
            await videoRef.current.play();
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
        if (!videoSrc) return;
        setIsBuffering(true);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(metadata?.duration || 0);
        setError(null);
        setShowError(false);
    }, [videoSrc, metadata?.duration]);

    const onPause = useCallback(() => {
        setIsPlaying(false);
        setIsControlsVisible(true);
    }, [setIsControlsVisible]);

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
        if (!videoSrc || isPreparing) return;
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
        if (target !== videoRef.current) return;
        void handleVideoFailure(err, msg);
    }, [handleVideoFailure, metadata?.path, videoRef, videoSrc, isPreparing]);

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
        onPause,
        onError,
    };
}
