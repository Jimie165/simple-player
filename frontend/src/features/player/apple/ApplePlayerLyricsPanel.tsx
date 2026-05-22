import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import FluidLyricsPanel from '@/features/player/lyrics/FluidLyricsPanel';
import LyricsPanel from '@/features/player/lyrics/LyricsPanel';
import type { LyricsLine } from '@/types';

interface ApplePlayerLyricsPanelProps {
    isLyricsOpen: boolean;
    lyricsMounted: boolean;
    panelFlipTarget: 'queue' | 'lyrics' | null;
    isPanelFlipping: boolean;
    lyrics: LyricsLine[] | null;
    lyricsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    hasTimestamps: boolean;
    currentTime: number;
    onSeek: (time: number) => void;
}

export default function ApplePlayerLyricsPanel({
    isLyricsOpen,
    lyricsMounted,
    panelFlipTarget,
    isPanelFlipping,
    lyrics,
    lyricsStatus,
    hasTimestamps,
    currentTime,
    onSeek,
}: ApplePlayerLyricsPanelProps) {
    const { playerEffectMode } = useTheme();
    const isFlippingIn = panelFlipTarget === 'lyrics' && isPanelFlipping && isLyricsOpen;
    const isFlippingOut = panelFlipTarget === 'queue' && isPanelFlipping;
    const isVisible = isLyricsOpen && !isFlippingOut;
    const isNormalReveal = isLyricsOpen && panelFlipTarget === null;

    // 动画配置
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
                'absolute inset-y-0 right-0 w-[56%] h-full max-h-[95%] flex flex-col z-10 overflow-hidden justify-center',
                'pl-[clamp(1rem,3vw,2.25rem)] pr-[clamp(1rem,3vw,2rem)]',
                isLyricsOpen ? 'pointer-events-auto' : 'pointer-events-none'
            )}
        >
            <div className="relative flex-1 overflow-hidden">
                <motion.div
                    className={clsx(
                        'absolute inset-0 origin-center transform-gpu',
                        !isVisible && 'pointer-events-none'
                    )}
                    initial="hidden"
                    animate={isVisible ? "visible" : "hidden"}
                    variants={variants}
                >
                    {lyricsMounted && (
                        playerEffectMode === 'animation' ? (
                            <FluidLyricsPanel
                                isOpen={isLyricsOpen}
                                lyrics={lyrics}
                                status={lyricsStatus}
                                hasTimestamps={hasTimestamps}
                                currentTime={currentTime}
                                onSeek={onSeek}
                            />
                        ) : (
                            <LyricsPanel
                                isOpen={isLyricsOpen}
                                lyrics={lyrics}
                                status={lyricsStatus}
                                hasTimestamps={hasTimestamps}
                                currentTime={currentTime}
                                onSeek={onSeek}
                            />
                        )
                    )}
                </motion.div>
            </div>
        </div>
    );
}
