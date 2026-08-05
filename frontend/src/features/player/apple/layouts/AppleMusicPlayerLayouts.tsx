import type { RefObject } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { SongMetadata, LyricsDocument } from '@/types';
import type { ViewState } from '@/store/useNavigationStore';
import ApplePlayerControlsSection, {
    ApplePlayerNarrowBottomControls,
    ApplePlayerNarrowHeader,
} from '@/features/player/apple/controls/ApplePlayerControlsSection';
import { ApplePlayerCover } from '@/features/player/apple/layouts/ApplePlayerCover';
import ApplePlayerQueuePanel from '@/features/player/apple/panels/ApplePlayerQueuePanel';
import ApplePlayerQueueToggle from '@/features/player/apple/toolbar/ApplePlayerQueueToggle';
import ApplePlayerLyricsToggle from '@/features/player/apple/toolbar/ApplePlayerLyricsToggle';
import ApplePlayerLyricsPanel from '@/features/player/apple/panels/ApplePlayerLyricsPanel';
import type { SidePanel } from '@/features/player/apple/shared/types';

interface BaseLayoutProps {
    metadata: SongMetadata | null;
    bgImageSrc: string | null;
    coverScale: number;
    isPlaying: boolean;
    isShuffling: boolean;
    toggleShuffle: () => void;
    playPrev: () => void;
    togglePlay: () => void;
    playNext: () => void;
    toggleRepeat: () => void;
    repeatMode: 'off' | 'all' | 'one';
    handleSeekChange: (value: number) => void;
    handleSeekStart: () => void;
    handleSeekEnd: () => void;
    localVolume: number;
    handleVolumeChange: (value: number) => void;
    handleVolumeSeekStart: () => void;
    handleVolumeSeekEnd: () => void;
    marqueeResetToken: number;
    onClose: () => void;
    push: (entry: ViewState) => void;
    toggleFavorite: (song: SongMetadata) => Promise<void>;
    isQueueOpen: boolean;
    isLyricsOpen: boolean;
    queueMounted: boolean;
    lyricsMounted: boolean;
    panelFlipTarget: SidePanel | null;
    isPanelFlipping: boolean;
    queueScrollToTopSignal: number;
    lyricsDocument: LyricsDocument | null;
    lyricsPath: string | null;
    lyricsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    seek: (time: number) => void;
    handleToggleLyrics: () => void;
    handleToggleQueue: () => void;
}

export function AppleMusicNarrowPanelLayout({
    metadata,
    bgImageSrc,
    coverScale,
    isPlaying,
    isShuffling,
    toggleShuffle,
    playPrev,
    togglePlay,
    playNext,
    toggleRepeat,
    repeatMode,
    handleSeekChange,
    handleSeekStart,
    handleSeekEnd,
    localVolume,
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
    closingPanel,
    narrowControlsVisible,
    narrowControlsRef,
    handleNarrowPanelScroll,
    handleNarrowControlsPointerEnter,
    handleNarrowControlsPointerMove,
    handleNarrowControlsPointerLeave,
}: BaseLayoutProps & {
    closingPanel: SidePanel | null;
    narrowControlsVisible: boolean;
    narrowControlsRef: RefObject<HTMLDivElement | null>;
    handleNarrowPanelScroll: (direction: 'up' | 'down', delta?: number) => void;
    handleNarrowControlsPointerEnter: () => void;
    handleNarrowControlsPointerMove: () => void;
    handleNarrowControlsPointerLeave: () => void;
}) {
    return (
        <motion.div
            key="narrow-panel-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
                opacity: 0,
                transition: { duration: closingPanel ? 0.35 : 0.2, ease: 'easeOut' },
            }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 z-20 flex flex-col px-5 pb-5"
        >
            <div className="flex items-center gap-3 shrink-0 pt-1 pb-2">
                <ApplePlayerCover
                    metadata={metadata}
                    bgImageSrc={bgImageSrc}
                    coverScale={coverScale}
                    isPlaying={isPlaying}
                    compact
                />
                <div className="min-w-0 flex-1">
                    <ApplePlayerNarrowHeader
                        metadata={metadata}
                        marqueeResetToken={marqueeResetToken}
                        onClose={onClose}
                        push={push}
                        toggleFavorite={toggleFavorite}
                    />
                </div>
            </div>

            <div className="relative flex-1 min-h-0">
                {!closingPanel && (
                    <>
                        <ApplePlayerQueuePanel
                            variant="narrow"
                            isQueueOpen={isQueueOpen}
                            queueMounted={queueMounted}
                            panelFlipTarget={panelFlipTarget}
                            isPanelFlipping={isPanelFlipping}
                            onClose={onClose}
                            queueScrollToTopSignal={queueScrollToTopSignal}
                            onUserScrollDirection={handleNarrowPanelScroll}
                            narrowControlsVisible={narrowControlsVisible}
                        />

                        <ApplePlayerLyricsPanel
                            variant="narrow"
                            isLyricsOpen={isLyricsOpen}
                            lyricsMounted={lyricsMounted}
                            panelFlipTarget={panelFlipTarget}
                            isPanelFlipping={isPanelFlipping}
                            lyricsDocument={lyricsDocument}
                            lyricsPath={lyricsPath}
                            lyricsStatus={lyricsStatus}
                            onSeek={seek}
                            onUserScrollDirection={handleNarrowPanelScroll}
                            narrowControlsVisible={narrowControlsVisible}
                        />
                    </>
                )}
            </div>

            <motion.div
                ref={narrowControlsRef}
                className="absolute left-[clamp(1rem,5vw,2rem)] right-[clamp(1rem,5vw,2rem)] z-30 flex flex-col gap-4"
                style={{ bottom: 'calc(clamp(1rem, 5vw, 2rem) - 12px)' }}
                onPointerEnter={handleNarrowControlsPointerEnter}
                onPointerMove={handleNarrowControlsPointerMove}
                onPointerLeave={handleNarrowControlsPointerLeave}
                initial={false}
                animate={{
                    opacity: narrowControlsVisible ? 1 : 0,
                    y: narrowControlsVisible ? 0 : 28,
                    pointerEvents: narrowControlsVisible ? 'auto' : 'none',
                }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
            >
                <ApplePlayerNarrowBottomControls
                    metadata={metadata}
                    handleSeekChange={handleSeekChange}
                    handleSeekStart={handleSeekStart}
                    handleSeekEnd={handleSeekEnd}
                    isShuffling={isShuffling}
                    toggleShuffle={toggleShuffle}
                    playPrev={playPrev}
                    togglePlay={togglePlay}
                    isPlaying={isPlaying}
                    playNext={playNext}
                    toggleRepeat={toggleRepeat}
                    repeatMode={repeatMode}
                    localVolume={localVolume}
                    handleVolumeChange={handleVolumeChange}
                    handleVolumeSeekStart={handleVolumeSeekStart}
                    handleVolumeSeekEnd={handleVolumeSeekEnd}
                />
                <div className="flex items-center justify-end mt-2">
                    <div className="flex items-center gap-2">
                        <ApplePlayerLyricsToggle
                            isLyricsOpen={isLyricsOpen}
                            hasLyrics={lyricsStatus !== 'empty' || isLyricsOpen}
                            onToggle={handleToggleLyrics}
                        />
                        <ApplePlayerQueueToggle
                            isQueueOpen={isQueueOpen}
                            onToggle={handleToggleQueue}
                        />
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

export function AppleMusicStandardLayout({
    metadata,
    bgImageSrc,
    coverScale,
    isPlaying,
    isShuffling,
    toggleShuffle,
    playPrev,
    togglePlay,
    playNext,
    toggleRepeat,
    repeatMode,
    handleSeekChange,
    handleSeekStart,
    handleSeekEnd,
    localVolume,
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
    mainContentWidth,
    coverRef,
    coverShellRef,
    controlsRef,
}: BaseLayoutProps & {
    mainContentWidth: number;
    coverRef: RefObject<HTMLDivElement | null>;
    coverShellRef: RefObject<HTMLDivElement | null>;
    controlsRef: RefObject<HTMLDivElement | null>;
}) {
    return (
        <motion.div
            key="standard-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 z-20 flex w-full min-h-0 px-[clamp(1rem,3vw,2rem)] pb-[clamp(3.5rem,6vw,5rem)]"
        >
            <div className={clsx(
                "relative z-20 flex flex-col items-center justify-center mr-auto",
                mainContentWidth < 560
                    ? "w-full px-[clamp(1rem,4vw,3rem)]"
                    : [
                        "transition-[width,padding-left,padding-right] duration-500 ease-[0.32,0.72,0,1]",
                        (isQueueOpen || isLyricsOpen) ? "w-[41%] pr-[clamp(0.5rem,1.5vw,1rem)]" : "w-full px-[clamp(1rem,4vw,3rem)]"
                      ]
            )}>
                <div className="w-full h-full max-w-125 flex flex-col gap-8 justify-center items-center mx-auto">
                    <div className="flex-1 min-h-0 flex items-center justify-center w-full">
                        <div
                            ref={coverShellRef}
                            className="relative aspect-square h-auto w-auto max-h-full max-w-full shrink-0"
                        >
                            <img
                                src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAwIiBoZWlnaHQ9IjEwMDAiPjwvc3ZnPg=="
                                alt=""
                                className="invisible block h-auto w-auto max-w-full max-h-full pointer-events-none"
                            />
                            <ApplePlayerCover
                                metadata={metadata}
                                bgImageSrc={bgImageSrc}
                                coverScale={coverScale}
                                isPlaying={isPlaying}
                                coverRef={coverRef}
                            />
                        </div>
                    </div>

                    <ApplePlayerControlsSection
                        controlsRef={controlsRef}
                        metadata={metadata}
                        marqueeResetToken={marqueeResetToken}
                        onClose={onClose}
                        push={push}
                        toggleFavorite={toggleFavorite}
                        handleSeekChange={handleSeekChange}
                        handleSeekStart={handleSeekStart}
                        handleSeekEnd={handleSeekEnd}
                        isShuffling={isShuffling}
                        toggleShuffle={toggleShuffle}
                        playPrev={playPrev}
                        togglePlay={togglePlay}
                        isPlaying={isPlaying}
                        playNext={playNext}
                        toggleRepeat={toggleRepeat}
                        repeatMode={repeatMode}
                        localVolume={localVolume}
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
                lyricsDocument={lyricsDocument}
                lyricsPath={lyricsPath}
                lyricsStatus={lyricsStatus}
                onSeek={seek}
            />

            <div className="absolute bottom-[clamp(1rem,2.5vw,2rem)] right-[clamp(1rem,2.5vw,2rem)] z-30 flex items-center gap-[clamp(0.5rem,1.2vw,0.85rem)]">
                <ApplePlayerLyricsToggle
                    isLyricsOpen={isLyricsOpen}
                    hasLyrics={lyricsStatus !== 'empty' || isLyricsOpen}
                    onToggle={handleToggleLyrics}
                />
                <ApplePlayerQueueToggle
                    isQueueOpen={isQueueOpen}
                    onToggle={handleToggleQueue}
                />
            </div>
        </motion.div>
    );
}
