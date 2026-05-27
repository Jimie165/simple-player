import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import FluidLyricsPanel from '@/features/player/lyrics/FluidLyricsPanel';
import LyricsPanel from '@/features/player/lyrics/LyricsPanel';
import type { LyricsLine } from '@/types';

interface ApplePlayerLyricsPanelProps {
    variant?: 'side' | 'narrow';
    isLyricsOpen: boolean;
    lyricsMounted: boolean;
    panelFlipTarget: 'queue' | 'lyrics' | null;
    isPanelFlipping: boolean;
    lyrics: LyricsLine[] | null;
    lyricsPath: string | null;
    lyricsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    hasTimestamps: boolean;
    currentTime: number;
    onSeek: (time: number) => void;
    onUserScrollDirection?: (direction: 'up' | 'down', delta?: number) => void;
    narrowControlsVisible?: boolean;
}

export default function ApplePlayerLyricsPanel({
    variant = 'side',
    isLyricsOpen,
    lyricsMounted,
    panelFlipTarget,
    isPanelFlipping,
    lyrics,
    lyricsPath,
    lyricsStatus,
    hasTimestamps,
    currentTime,
    onSeek,
    onUserScrollDirection,
    narrowControlsVisible = true,
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
                variant === 'side'
                    ? 'absolute inset-y-0 right-0 w-[56%] h-full max-h-[95%] flex flex-col z-10 overflow-hidden justify-center pl-[clamp(1rem,3vw,2.25rem)] pr-[clamp(1rem,3vw,2rem)]'
                    : 'absolute inset-0 w-full h-full flex flex-col z-10 overflow-hidden',
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
                    style={variant === 'narrow' ? {
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
                        playerEffectMode === 'animation' ? (
                            <FluidLyricsPanel
                                key={`fluid-${lyricsPath ?? 'empty'}`}
                                isOpen={isLyricsOpen}
                                lyrics={lyrics}
                                status={lyricsStatus}
                                hasTimestamps={hasTimestamps}
                                currentTime={currentTime}
                                onSeek={onSeek}
                                onUserScrollDirection={onUserScrollDirection}
                                variant={variant}
                            />
                        ) : (
                            <LyricsPanel
                                key={`virtual-${lyricsPath ?? 'empty'}`}
                                isOpen={isLyricsOpen}
                                lyrics={lyrics}
                                status={lyricsStatus}
                                hasTimestamps={hasTimestamps}
                                currentTime={currentTime}
                                onSeek={onSeek}
                                onUserScrollDirection={onUserScrollDirection}
                                variant={variant}
                            />
                        )
                    )}
                </motion.div>
            </div>
        </div>
    );
}
