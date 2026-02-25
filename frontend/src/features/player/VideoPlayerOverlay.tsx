import { useState, useEffect, useRef } from 'react';

import { usePlayerStore } from '@/store/usePlayerStore';
import { formatTime } from '@/utils/time';
import {
    MdPlayArrow, MdPause,
    MdVolumeUp, MdVolumeOff, MdFullscreen, MdFullscreenExit,
    MdArrowBack, MdSkipPrevious, MdSkipNext, MdPlaylistPlay
} from 'react-icons/md';
import { AnimatePresence, motion } from 'framer-motion';
import MusicSlider from '@/components/common/MusicSlider';
import { systemService } from '@/services/systemService';
import { VscChromeMinimize, VscChromeMaximize, VscChromeRestore, VscChromeClose } from 'react-icons/vsc';
import { VideoPlaylistDrawer } from './video/VideoPlaylistDrawer';
import { useVideoPlayback } from './hooks/useVideoPlayback';
import { useVideoControls } from './hooks/useVideoControls';

export default function VideoPlayerOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const {
        videoMetadata: metadata,
        videoQueue,
        currentVideoIndex,
        playNextVideo,
        playPreviousVideo,
        setVideoQueue,
        volume,
        setVolume,
    } = usePlayerStore();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isControlsVisible, setIsControlsVisible] = useState(true);
    const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isPlayingRef = useRef(false);
    const isDraggingRef = useRef(false);

    const {
        isFullscreen,
        isMaximized,
        isCompact,
        isPlaylistOpen,
        setIsPlaylistOpen,
        toggleAppFullscreen,
    } = useVideoControls();

    const autoHideEnabled = true;
    const showControls = () => {
        setIsControlsVisible(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);

        if (isOpen && autoHideEnabled) {
            controlsTimeoutRef.current = setTimeout(() => {
                if (!isDraggingRef.current && isPlayingRef.current) {
                    setIsControlsVisible(false);
                }
            }, 3000);
        }
    };

    const clearHideTimer = () => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = null;
        }
    };

    const {
        isPlaying,
        setIsPlaying,
        currentTime,
        duration,
        isDragging,
        error,
        showError,
        isBuffering,
        prepareStage,
        preparePercent,
        isPreparing,
        posterUrl,
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
    } = useVideoPlayback({
        isOpen,
        metadata,
        videoRef,
        volume,
        videoQueueLength: videoQueue.length,
        playPreviousVideo,
        playNextVideo,
        showControls,
        clearHideTimer,
        setIsControlsVisible,
        toggleAppFullscreen,
    });

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    useEffect(() => {
        isDraggingRef.current = isDragging;
    }, [isDragging]);

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
    }, [isOpen, isCompact]);

    const handleClose = async () => {
        if (videoRef.current) {
            videoRef.current.pause();
            setIsPlaying(false);
        }

        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.playbackState = 'none';
        }

        onClose();
    };

    const useNativeControls = isCompact;
    const videoFitClass = 'object-contain';


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
                    poster={posterUrl}
                    onTimeUpdate={onTimeUpdate}
                    onLoadedMetadata={onLoadedMetadata}
                    onEnded={onEnded}
                    onLoadStart={onLoadStart}
                    onWaiting={onWaiting}
                    onCanPlay={onCanPlay}
                    onPlaying={onPlaying}
                    onError={onError}
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
                    <VideoPlaylistDrawer
                        isOpen={isPlaylistOpen}
                        onClose={() => setIsPlaylistOpen(false)}
                        videoQueue={videoQueue}
                        currentVideoIndex={currentVideoIndex}
                        onSelectVideo={(index) => setVideoQueue(videoQueue, index)}
                    />
                </AnimatePresence>

            </motion.div>

        </>
    );
}
