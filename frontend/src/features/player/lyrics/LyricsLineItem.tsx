import clsx from 'clsx';
import { motion, type Transition } from 'framer-motion';
import type { RefObject } from 'react';
import type { LyricsLine } from '@/types';
import KaraokeText from '@/features/player/lyrics/KaraokeText';

interface LyricsLineItemProps {
    line: LyricsLine;
    isActive: boolean;
    isKaraokeActive?: boolean;
    isUserScrolling: boolean;
    pausedScroll: boolean;
    distanceFromActive: number;
    interludeShift: number;
    interludeShiftDurationMs: number;
    lineEndMs: number | null;
    nextLineStartMs?: number | null;
    enableTightHandoffTailCompression?: boolean;
    currentTime: number;
    preciseMsRef: RefObject<number>;
    onSeek: (time: number) => void;
    fluidMotion?: boolean;
    targetScrollY?: number;
    motionDelay?: number;
    springParams?: Transition;
    variant?: 'side' | 'narrow';
}

export default function LyricsLineItem({
    line,
    isActive,
    isKaraokeActive = isActive,
    isUserScrolling,
    pausedScroll,
    distanceFromActive,
    interludeShift,
    interludeShiftDurationMs,
    lineEndMs,
    nextLineStartMs = null,
    enableTightHandoffTailCompression = false,
    currentTime,
    preciseMsRef,
    onSeek,
    fluidMotion = false,
    targetScrollY = 0,
    motionDelay = 0,
    springParams,
    variant,
}: LyricsLineItemProps) {
    const isNarrow = variant === 'narrow';
    const blurPx = isActive
        ? 0
        : isNarrow
            ? Math.min(2.8, 0.3 + distanceFromActive * 0.45)
            : Math.min(5.4, 0.8 + distanceFromActive * 1.05);

    const rowOpacity = isActive
        ? 1
        : isNarrow
            ? Math.max(0.35, 0.85 - distanceFromActive * 0.07)
            : Math.max(0.22, 0.82 - distanceFromActive * 0.12);

    const rowFilter = isUserScrolling || pausedScroll ? 'blur(0px)' : `blur(${blurPx}px)`;
    const appliedOpacity = isUserScrolling || pausedScroll ? 1 : rowOpacity;
    const canSeek = line.time_ms !== null;
    const currentMs = currentTime * 1000;
    const karaokeWords = line.words ?? [];
    const shouldRenderKaraoke = karaokeWords.length > 0;
    const handleClick = () => {
        if (line.time_ms === null) return;
        onSeek(line.time_ms / 1000);
    };
    const className = clsx(
        'w-full text-left pl-[clamp(1.2rem,2.2vw,2rem)] pr-[clamp(1.7rem,3vw,2.9rem)] py-[clamp(0.7rem,1.3vw,1.25rem)] origin-left will-change-[filter,opacity,transform]',
        canSeek ? 'cursor-pointer' : 'cursor-default',
        isActive ? 'text-white drop-shadow-xl' : 'text-white'
    );
    const renderingIsolationStyle = {
        contentVisibility: 'auto',
        contain: 'layout style paint',
        containIntrinsicSize: 'auto 90px',
        backfaceVisibility: 'hidden',
    } as const;
    const targetScale = isActive ? 1.05 : 1;
    const content = (
        <motion.div
            initial={false}
            animate={fluidMotion ? { scale: targetScale } : undefined}
            transition={fluidMotion ? {
                scale: {
                    type: 'spring',
                    mass: 2,
                    damping: 25,
                    stiffness: 100,
                    restDelta: 0.0001,
                    restSpeed: 0.001,
                    delay: motionDelay,
                },
            } : undefined}
            transformTemplate={(_, generatedTransform) =>
                generatedTransform === 'none'
                    ? 'translateZ(0)'
                    : generatedTransform + ' translateZ(0)'
            }
            style={fluidMotion ? {
                transformOrigin: 'left center',
                willChange: 'transform',
                backfaceVisibility: 'hidden',
            } : {
                transform: 'scale(' + targetScale + ') translateZ(0)',
                transformOrigin: 'left center',
                transition: 'transform ' + interludeShiftDurationMs + 'ms cubic-bezier(0.25, 1, 0.5, 1)',
                willChange: 'transform',
                backfaceVisibility: 'hidden',
            }}
        >
            <span
                style={!shouldRenderKaraoke ? {
                    transitionDelay: `${motionDelay}s`,
                } : undefined}
                className={clsx(
                    'block font-bold text-[clamp(1.68rem,4.5vmin,3.10rem)] leading-[1.38] tracking-wide relative',
                    shouldRenderKaraoke
                        ? (isActive ? 'transition-none' : 'transition-opacity duration-500 ease-in-out')
                        : 'transition-all duration-500 ease-in-out',
                    isActive ? 'opacity-100' : 'opacity-30 hover:opacity-75'
                )}
            >
                {shouldRenderKaraoke ? (
                    <KaraokeText
                        words={karaokeWords}
                        lineEndMs={lineEndMs}
                        nextLineStartMs={nextLineStartMs}
                        enableTightHandoffTailCompression={enableTightHandoffTailCompression}
                        currentMs={isKaraokeActive ? currentMs : 0}
                        preciseMsRef={preciseMsRef}
                        isActive={isKaraokeActive}
                    />
                ) : (
                    line.text
                )}
            </span>
            {line.translation && (
                <span
                    style={!shouldRenderKaraoke ? {
                        transitionDelay: `${motionDelay}s`,
                    } : undefined}
                    className={clsx(
                        'block font-medium text-[clamp(1.08rem,2.8vmin,1.92rem)] leading-[1.34] tracking-wide mt-1 transition-all duration-300',
                        isActive
                            ? 'text-white/65 opacity-95 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]'
                            : 'text-white/32 opacity-80'
                    )}
                >
                    {line.translation}
                </span>
            )}
        </motion.div>
    );

    if (fluidMotion) {
        return (
            <motion.button
                type="button"
                onClick={handleClick}
                disabled={!canSeek}
                style={renderingIsolationStyle}
                animate={{
                    y: interludeShift - targetScrollY,
                    filter: rowFilter,
                    opacity: appliedOpacity,
                }}
                transition={{
                    y: {
                        ...(springParams || { type: 'spring', stiffness: 85, damping: 14, mass: 0.8 }),
                        delay: motionDelay,
                    },
                    filter: { duration: 0.38, ease: 'easeOut', delay: motionDelay * 0.2 },
                    opacity: { duration: 0.35, ease: 'easeOut', delay: motionDelay * 0.2 },
                }}
                className={className}
            >
                {content}
            </motion.button>
        );
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={!canSeek}
            style={{
                ...renderingIsolationStyle,
                filter: rowFilter,
                opacity: appliedOpacity,
                transform: 'translateY(' + interludeShift + 'px)',
                transition: 'filter 300ms, opacity 300ms, transform ' + interludeShiftDurationMs + 'ms cubic-bezier(0.25, 1, 0.5, 1)',
            }}
            className={className}
        >
            {content}
        </button>
    );
}
