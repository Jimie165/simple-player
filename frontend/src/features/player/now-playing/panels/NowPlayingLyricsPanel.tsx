import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import AnimatedLyricsPanel from '@/features/player/lyrics/AnimatedLyricsPanel';
import LyricsPanel from '@/features/player/lyrics/LyricsPanel';
import PlainLyricsPanel from '@/features/player/lyrics/PlainLyricsPanel';
import type { LyricsDocument } from '@/types';
import { usePlayerStore } from '@/store/usePlayerStore';
import type { LyricsPanelProps } from '@/features/player/lyrics/types';

interface NowPlayingLyricsPanelProps {
    variant?: 'side' | 'narrow';
    isLyricsOpen: boolean;
    lyricsMounted: boolean;
    panelFlipTarget: 'queue' | 'lyrics' | null;
    isPanelFlipping: boolean;
    lyricsDocument: LyricsDocument | null;
    lyricsPath: string | null;
    lyricsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    onSeek: (time: number) => void;
    onUserScrollDirection?: (direction: 'up' | 'down', delta?: number) => void;
    narrowControlsVisible?: boolean;
}

export default function NowPlayingLyricsPanel({
    variant = 'side',
    isLyricsOpen,
    lyricsMounted,
    panelFlipTarget,
    isPanelFlipping,
    lyricsDocument,
    lyricsPath,
    lyricsStatus,
    onSeek,
    onUserScrollDirection,
    narrowControlsVisible = true,
}: NowPlayingLyricsPanelProps) {
    const { playerEffectMode, lyricLineBlendEnabled } = useTheme();
    const hasTimestamps = (lyricsDocument?.timing_mode ?? 'none') !== 'none';
    const blendLyrics = lyricLineBlendEnabled && hasTimestamps;
    const isFlippingIn = panelFlipTarget === 'lyrics' && isPanelFlipping && isLyricsOpen;
    const isFlippingOut = panelFlipTarget === 'queue' && isPanelFlipping;
    const isVisible = isLyricsOpen && !isFlippingOut;
    const isNormalReveal = isLyricsOpen && panelFlipTarget === null;

    const variants: Variants = {
        visible: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: {
                y: { type: 'spring', stiffness: 90, damping: 14, mass: 0.8 },
                scale: { type: 'spring', stiffness: 90, damping: 14, mass: 0.8 },
                opacity: { duration: 0.35, ease: 'easeOut' },
                delay: isNormalReveal ? 0.22 : (isFlippingIn ? 0.08 : 0)
            }
        },
        hidden: {
            opacity: 0,
            scale: isPanelFlipping ? 0.96 : 0.94,
            y: isPanelFlipping ? 16 : 40,
            transition: {
                duration: isFlippingOut ? 0.25 : 0.35,
                ease: 'easeOut'
            }
        }
    };

    return (
        <div
            className={clsx(
                variant === 'side'
                    ? 'absolute inset-y-0 right-0 w-[56%] h-full max-h-[95%] flex flex-col overflow-hidden justify-center pl-[clamp(1rem,3vw,2.25rem)] pr-[clamp(1rem,3vw,2rem)]'
                    : 'absolute inset-0 w-full h-full flex flex-col overflow-hidden',
                !blendLyrics && 'z-10',
                isLyricsOpen ? 'pointer-events-auto' : 'pointer-events-none'
            )}
        >
            <div className="relative flex-1 overflow-hidden">
                <motion.div
                    className={clsx(
                        'absolute inset-0 origin-center',
                        // Blend the lyric group with the backdrop throughout
                        // the reveal, keeping its child blend scope stable at opacity 1.
                        blendLyrics && 'isolate mix-blend-plus-lighter',
                        !blendLyrics && 'transform-gpu',
                        !isVisible && 'pointer-events-none'
                    )}
                    initial="hidden"
                    animate={isVisible ? 'visible' : 'hidden'}
                    variants={variants}
                    style={variant === 'narrow' && blendLyrics ? {
                        bottom: narrowControlsVisible ? '18rem' : 0,
                    } : variant === 'narrow' ? {
                        maskImage: narrowControlsVisible
                            ? 'linear-gradient(to bottom, black 0%, black calc(100% - 18rem), transparent calc(100% - 14.5rem))'
                            : 'linear-gradient(to bottom, black 0%, black calc(100% - 1.5rem), transparent 100%)',
                        WebkitMaskImage: narrowControlsVisible
                            ? 'linear-gradient(to bottom, black 0%, black calc(100% - 18rem), transparent calc(100% - 14.5rem))'
                            : 'linear-gradient(to bottom, black 0%, black calc(100% - 1.5rem), transparent 100%)',
                        transition: 'mask-image 0.3s ease-out, -webkit-mask-image 0.3s ease-out'
                    } : undefined}
                >
                    {lyricsMounted && (
                        !hasTimestamps ? (
                            <PlainLyricsPanel
                                lyricsDocument={lyricsDocument}
                                status={lyricsStatus}
                            />
                        ) : playerEffectMode === 'animation' ? (
                            <AnimatedLyricsPanel
                                key={`animated-${lyricsPath ?? 'empty'}`}
                                isOpen={isLyricsOpen}
                                lyricsDocument={lyricsDocument}
                                status={lyricsStatus}
                                playerEffectMode={playerEffectMode}
                                currentTime={usePlayerStore.getState().currentTime}
                                onSeek={onSeek}
                                onUserScrollDirection={onUserScrollDirection}
                                variant={variant}
                                narrowControlsVisible={narrowControlsVisible}
                            />
                        ) : (
                            <SyncedPerformanceLyricsPanel
                                key={`virtual-${lyricsPath ?? 'empty'}`}
                                isOpen={isLyricsOpen}
                                lyricsDocument={lyricsDocument}
                                status={lyricsStatus}
                                playerEffectMode={playerEffectMode}
                                onSeek={onSeek}
                                onUserScrollDirection={onUserScrollDirection}
                                variant={variant}
                                narrowControlsVisible={narrowControlsVisible}
                            />
                        )
                    )}
                </motion.div>
            </div>
        </div>
    );
}

function SyncedPerformanceLyricsPanel(props: Omit<LyricsPanelProps, 'currentTime'>) {
    const currentTime = usePlayerStore(state => state.currentTime);
    return <LyricsPanel {...props} currentTime={currentTime} />;
}
