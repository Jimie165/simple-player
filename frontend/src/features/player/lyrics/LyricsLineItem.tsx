import clsx from 'clsx';
import { memo, useEffect, useRef, type RefObject } from 'react';
import type { LyricsLine } from '@/types';
import KaraokeText from '@/features/player/lyrics/KaraokeText';
import { getFluidLyricsRowVisualStyle } from '@/features/player/lyrics/fluidLyricsMotion';

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
    motionDelay?: number;
    variant?: 'side' | 'narrow';
}

let lyricsViewportObserver: IntersectionObserver | null = null;

const getLyricsViewportObserver = () => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return null;

    lyricsViewportObserver ??= new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            entry.target.toggleAttribute('data-in-lyrics-viewport', entry.isIntersecting);
        });
    });

    return lyricsViewportObserver;
};

function LyricsLineItem({
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
    motionDelay = 0,
    variant,
}: LyricsLineItemProps) {
    const rowRef = useRef<HTMLButtonElement | null>(null);
    const rowVisualStyle = getFluidLyricsRowVisualStyle({
        delay: motionDelay,
        distanceFromActive,
        isActive,
        isUserScrolling,
        pausedScroll,
        variant: variant ?? 'side',
    });
    const canSeek = line.time_ms !== null;
    const currentMs = currentTime * 1000;
    const karaokeWords = line.words ?? [];
    const shouldRenderKaraoke = karaokeWords.length > 0;
    const handleClick = () => {
        if (line.time_ms === null) return;
        onSeek(line.time_ms / 1000);
    };
    useEffect(() => {
        const row = rowRef.current;
        if (!row) return;

        const observer = getLyricsViewportObserver();
        if (!observer) {
            row.setAttribute('data-in-lyrics-viewport', '');
            return;
        }

        observer.observe(row);
        return () => observer.unobserve(row);
    }, []);
    const className = clsx(
        'lyrics-motion-row w-full text-left pl-[clamp(1.2rem,2.2vw,2rem)] pr-[clamp(1.7rem,3vw,2.9rem)] py-[clamp(0.7rem,1.3vw,1.25rem)] origin-left',
        canSeek ? 'cursor-pointer' : 'cursor-default',
        isActive ? 'text-white drop-shadow-xl' : 'text-white'
    );
    // Fluid scrolling depends on every row's real geometry. Intrinsic placeholders
    // would shift later rows as they enter the viewport and restart their springs.
    const renderingIsolationStyle = fluidMotion
        ? {
            contain: 'layout style paint',
            backfaceVisibility: 'hidden',
        } as const
        : {
            contentVisibility: 'auto',
            contain: 'layout style paint',
            containIntrinsicSize: 'auto 90px',
            backfaceVisibility: 'hidden',
        } as const;
    const targetScale = isActive ? 1 : 0.98;
    const content = (
        <div
            data-fluid-lyrics-scale={fluidMotion ? '' : undefined}
            className="lyrics-line-scale-layer"
            style={fluidMotion ? {
                transformOrigin: 'left center',
                backfaceVisibility: 'hidden',
            } : {
                transform: 'scale(' + targetScale + ') translateZ(0)',
                transformOrigin: 'left center',
                transition: 'transform ' + interludeShiftDurationMs + 'ms cubic-bezier(0.25, 1, 0.5, 1)',
                backfaceVisibility: 'hidden',
            }}
        >
            <span
                style={!shouldRenderKaraoke ? {
                    transitionDelay: `${motionDelay}s`,
                } : undefined}
                className={clsx(
                    'block font-bold text-[clamp(1.76rem,4.73vmin,3.26rem)] leading-[1.38] tracking-wide relative',
                    shouldRenderKaraoke
                        ? (isActive ? 'transition-none' : 'transition-opacity duration-500 ease-in-out')
                        : 'transition-all duration-500 ease-in-out',
                    shouldRenderKaraoke
                        ? isActive
                            ? 'opacity-100'
                            : 'opacity-30 hover:opacity-75'
                        : isActive
                            ? 'opacity-100'
                            : 'opacity-30 hover:opacity-75'
                )}
            >
                {shouldRenderKaraoke ? (
                    <KaraokeText
                        words={karaokeWords}
                        lineEndMs={lineEndMs}
                        nextLineStartMs={nextLineStartMs}
                        enableTightHandoffTailCompression={enableTightHandoffTailCompression}
                        currentMs={currentMs}
                        preciseMsRef={preciseMsRef}
                        isActive={isKaraokeActive}
                        isFocused={isActive}
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
                        'block font-medium text-[clamp(1.13rem,2.94vmin,2.02rem)] leading-[1.34] tracking-wide mt-1 transition-all duration-300',
                        isActive
                            ? 'text-white/65 opacity-95 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]'
                            : 'text-white/32 opacity-80'
                    )}
                >
                    {line.translation}
                </span>
            )}
        </div>
    );

    if (fluidMotion) {
        return (
            <button
                ref={rowRef}
                type="button"
                onClick={handleClick}
                disabled={!canSeek}
                style={{
                    ...renderingIsolationStyle,
                    ...rowVisualStyle,
                }}
                className={className}
            >
                {content}
            </button>
        );
    }

    return (
        <button
            ref={rowRef}
            type="button"
            onClick={handleClick}
            disabled={!canSeek}
            style={{
                ...renderingIsolationStyle,
                filter: rowVisualStyle.filter,
                opacity: rowVisualStyle.opacity,
                transform: 'translateY(' + interludeShift + 'px)',
                transition: 'filter 300ms, opacity 300ms, transform ' + interludeShiftDurationMs + 'ms cubic-bezier(0.25, 1, 0.5, 1)',
            }}
            className={className}
        >
            {content}
        </button>
    );
}

const areLyricsLineItemPropsEqual = (prev: LyricsLineItemProps, next: LyricsLineItemProps) => (
    prev.line === next.line &&
    prev.isActive === next.isActive &&
    prev.isKaraokeActive === next.isKaraokeActive &&
    prev.isUserScrolling === next.isUserScrolling &&
    prev.pausedScroll === next.pausedScroll &&
    (prev.fluidMotion && next.fluidMotion || prev.distanceFromActive === next.distanceFromActive) &&
    prev.interludeShift === next.interludeShift &&
    prev.interludeShiftDurationMs === next.interludeShiftDurationMs &&
    prev.lineEndMs === next.lineEndMs &&
    prev.nextLineStartMs === next.nextLineStartMs &&
    prev.enableTightHandoffTailCompression === next.enableTightHandoffTailCompression &&
    prev.preciseMsRef === next.preciseMsRef &&
    prev.onSeek === next.onSeek &&
    prev.fluidMotion === next.fluidMotion &&
    (
        prev.fluidMotion &&
        next.fluidMotion &&
        (prev.line.words?.length ?? 0) > 0
        || prev.motionDelay === next.motionDelay
    ) &&
    prev.variant === next.variant
);

export default memo(LyricsLineItem, areLyricsLineItemPropsEqual);
