import { useEffect, useMemo, useRef, useState, memo, type RefObject } from 'react';
import type { LyricsWord } from '@/types';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';

interface KaraokeTextProps {
    words: LyricsWord[];
    lineEndMs: number | null;
    nextLineStartMs?: number | null;
    enableTightHandoffTailCompression?: boolean;
    currentMs: number;
    preciseMsRef: RefObject<number>;
    isActive: boolean;
    isFocused: boolean;
}

type IndexedCharItem = {
    item: FlatCharItem;
    flatIndex: number;
};

type KaraokeCharStyle = {
    transform: string;
    translateYEm: number;
    scaleValue: number;
    willChange: string;
    fillBackgroundImage: string;
    glowMask: string;
    glowOpacity: number;
    glowShadow: string;
};

const karaokeExitDurationMs = 500;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
};
const scaleEmphasisEase = (value: number) => {
    const x = clamp01(value);
    if (x >= 0.5) return smoothstep((1 - x) / 0.5);

    const attack = smoothstep(x / 0.5);
    return 1 - Math.pow(1 - attack, 1.35);
};

function getKaraokeCharStyle(
    charItem: FlatCharItem,
    timeMs: number,
    isActive: boolean = true
): KaraokeCharStyle {
    const {
        time_ms,
        durationMs,
        groupStartMs,
        groupDurationMs,
        activeCharIndexInWord,
        activeCharCountInWord,
    } = charItem;
    const baseAlpha = isActive ? 0.30 : 1.0;
    const rawProgress = (timeMs - time_ms) / durationMs;
    const progress = clamp01(rawProgress);
    const isComplete = rawProgress >= 1;
    const stopVal = progress * 100;
    const hasProgress = progress > 0;

    const longToneRaw = clamp01((groupDurationMs - 800) / 760);
    const longToneAmount = smoothstep(longToneRaw);
    const edgeWidth = 26 + longToneAmount * 18;
    const edgeAlpha = 0.72 + longToneAmount * 0.2;
    const softEdgeStart = hasProgress ? Math.max(0, stopVal - edgeWidth) : 0;
    const softEdgeEnd = hasProgress ? Math.min(125, stopVal + edgeWidth) : 0;

    const elapsedMs = timeMs - time_ms;
    const hasStarted = elapsedMs > 0;
    const attackMs = Math.max(800, durationMs);
    const lift = hasStarted ? Math.sin((clamp01(elapsedMs / attackMs) * Math.PI) / 2) : 0;

    const charCount = Math.max(1, activeCharCountInWord);
    const charIndex = Math.max(0, activeCharIndexInWord);
    const charDelayMs = (groupDurationMs / 2.5 / charCount) * charIndex;
    const emphasisDurationMs = Math.max(800, groupDurationMs);
    const emphasisProgress = (timeMs - groupStartMs - charDelayMs) / emphasisDurationMs;

    // Scaling follows each character's complete staggered wave. Its slightly
    // broader visible attack keeps trailing characters growing before the short
    // acceleration phase, while the word-level release cannot truncate them.
    const scaleEffect = longToneAmount * scaleEmphasisEase(emphasisProgress);
    const lastCharDelayMs = (groupDurationMs / 2.5 / charCount) * (charCount - 1);
    const glowEndMs = groupStartMs + lastCharDelayMs + emphasisDurationMs;
    const glowReleaseMs = Math.min(720, Math.max(480, groupDurationMs * 0.22));
    const glowRelease = smoothstep((glowEndMs - timeMs) / glowReleaseMs);
    const glowBuild = hasProgress ? 1 - Math.pow(1 - progress, 2) : 0;
    const glowEffect = longToneAmount * glowBuild * glowRelease;

    const emphasisFloatProgress = clamp01((timeMs - (groupStartMs + charDelayMs - 400)) / (emphasisDurationMs * 1.4));
    const emphasisLift = Math.sin(emphasisFloatProgress * Math.PI) * longToneAmount;
    const translateY = lift * -0.078 + emphasisLift * -0.07;
    const scale = 1 + scaleEffect * 0.1;
    const glowOpacity = glowEffect * (0.5 + progress * 0.35);
    const glowRadius = 2.5 + glowEffect * 9;
    const glowShadow = glowEffect > 0.01
        ? `0 0 ${Math.min(5, glowRadius * 0.45)}px rgba(255,255,255,${0.34 + glowEffect * 0.2}), 0 0 ${glowRadius}px rgba(255,255,255,${0.18 + glowEffect * 0.24})`
        : 'none';
    const glowMask = isComplete
        ? 'linear-gradient(to right, #fff, #fff)'
        : hasProgress
            ? `linear-gradient(to right, #fff 0%, #fff ${softEdgeStart}%, rgba(255,255,255,0.72) ${stopVal}%, transparent ${softEdgeEnd}%, transparent 100%)`
            : 'linear-gradient(to right, transparent, transparent)';
    const fillBackgroundImage = isComplete
        ? 'linear-gradient(to right, rgba(255,255,255,1), rgba(255,255,255,1))'
        : hasProgress
            ? `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${softEdgeStart}%, rgba(255,255,255,${edgeAlpha}) ${stopVal}%, rgba(255,255,255,${baseAlpha}) ${softEdgeEnd}%, rgba(255,255,255,${baseAlpha}) 100%)`
            : `linear-gradient(to right, rgba(255,255,255,${baseAlpha}), rgba(255,255,255,${baseAlpha}))`;

    return {
        transform: `translate3d(0, ${translateY.toFixed(4)}em, 0) scale(${scale.toFixed(4)})`,
        translateYEm: translateY,
        scaleValue: scale,
        willChange: 'transform',
        fillBackgroundImage,
        glowMask,
        glowOpacity: glowOpacity > 0.01 ? glowOpacity : 0,
        glowShadow,
    };
}

function KaraokeTextBase({
    words,
    lineEndMs,
    nextLineStartMs = null,
    enableTightHandoffTailCompression = false,
    currentMs: baseCurrentMs,
    preciseMsRef,
    isActive,
    isFocused,
}: KaraokeTextProps) {
    const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const fillRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const glowRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const [richLayerState, setRichLayerState] = useState({
        focused: isFocused,
        visible: isFocused,
        settling: false,
    });
    if (richLayerState.focused !== isFocused) {
        setRichLayerState({
            focused: isFocused,
            visible: isFocused || richLayerState.visible,
            settling: false,
        });
    }
    const keepRichLayer = richLayerState.visible;

    const flatChars = useMemo(
        () => parseLyricsWordsToChars(words, lineEndMs, {
            enabled: enableTightHandoffTailCompression,
            nextLineStartMs,
        }),
        [enableTightHandoffTailCompression, words, lineEndMs, nextLineStartMs]
    );

    const wordGroups = useMemo(() => {
        const groups: IndexedCharItem[][] = [];
        flatChars.forEach((charItem, flatIndex) => {
            if (!groups[charItem.wordIndex]) {
                groups[charItem.wordIndex] = [];
            }
            groups[charItem.wordIndex].push({ item: charItem, flatIndex });
        });
        return groups;
    }, [flatChars]);

    useEffect(() => {
        if (!isActive || !isFocused) return;

        const previousStyles: Array<KaraokeCharStyle | undefined> = [];
        const updateWordStyles = (timeMs: number) => {
            flatChars.forEach((charItem, index) => {
                const el = wordRefs.current[index];
                const fillEl = fillRefs.current[index];
                const glowEl = glowRefs.current[index];
                if (!el || !fillEl || !glowEl) return;

                const style = getKaraokeCharStyle(charItem, timeMs, true);
                const previousStyle = previousStyles[index];
                if (style.transform !== previousStyle?.transform) {
                    el.style.transform = style.transform;
                }
                if (style.willChange !== previousStyle?.willChange) {
                    el.style.willChange = style.willChange;
                }
                if (style.fillBackgroundImage !== previousStyle?.fillBackgroundImage) {
                    fillEl.style.backgroundImage = style.fillBackgroundImage;
                }
                if (style.glowMask !== previousStyle?.glowMask) {
                    glowEl.style.maskImage = style.glowMask;
                    glowEl.style.webkitMaskImage = style.glowMask;
                }
                if (style.glowOpacity !== previousStyle?.glowOpacity) {
                    glowEl.style.opacity = String(style.glowOpacity);
                }
                if (style.glowShadow !== previousStyle?.glowShadow) {
                    glowEl.style.textShadow = style.glowShadow;
                }
                previousStyles[index] = style;
            });
        };

        let frame: number;
        let lastTimeMs = Number.NaN;

        const tick = () => {
            const timeMs = preciseMsRef.current;
            if (timeMs !== lastTimeMs) {
                updateWordStyles(timeMs);
                lastTimeMs = timeMs;
            }
            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [flatChars, isActive, isFocused, preciseMsRef]);

    useEffect(() => {
        if (!keepRichLayer) return;
        if (isFocused) return;

        let settleFrame = 0;
        let releaseFrame = 0;
        const timer = window.setTimeout(() => {
            setRichLayerState(state => state.focused ? state : { ...state, settling: true });

            // Let the same glyphs paint without their character transforms before
            // replacing the rich layer, so Chromium does not swap rasterization
            // modes on the same frame as the visible exit animation.
            settleFrame = requestAnimationFrame(() => {
                releaseFrame = requestAnimationFrame(() => {
                    setRichLayerState(state => state.focused
                        ? state
                        : { ...state, visible: false, settling: false });
                });
            });
        }, karaokeExitDurationMs);

        return () => {
            window.clearTimeout(timer);
            cancelAnimationFrame(settleFrame);
            cancelAnimationFrame(releaseFrame);
        };
    }, [isFocused, keepRichLayer]);

    const richStyles = useMemo(
        () => keepRichLayer
            ? flatChars.map(charItem => getKaraokeCharStyle(charItem, baseCurrentMs, true))
            : [],
        [baseCurrentMs, flatChars, keepRichLayer]
    );
    const renderWordGroups = (rich: boolean) => wordGroups.map((group, wordIndex) => {
                if (!group || group.length === 0) return null;

                return (
                    <span
                        key={wordIndex}
                        style={{
                            display: 'inline-block',
                            whiteSpace: 'nowrap',
                            transform: 'none',
                            willChange: 'auto',
                            transition: 'none',
                            backfaceVisibility: 'hidden',
                            overflow: 'visible',
                        }}
                    >
                        {group.map(({ item: charItem, flatIndex }) => {
                            if (!rich) {
                                return (
                                    <span
                                        key={charItem.charIndexInWord}
                                        style={{
                                            position: 'relative',
                                            display: 'inline-block',
                                            whiteSpace: 'pre-wrap',
                                            transform: 'none',
                                            willChange: 'auto',
                                            transition: 'none',
                                            backfaceVisibility: 'hidden',
                                            overflow: 'visible',
                                        }}
                                    >
                                        <span
                                            style={{
                                                position: 'relative',
                                                zIndex: 1,
                                                backgroundImage: 'linear-gradient(to right, currentColor, currentColor)',
                                                WebkitBackgroundClip: 'text',
                                                backgroundClip: 'text',
                                                WebkitTextFillColor: 'transparent',
                                                color: 'currentColor',
                                            }}
                                        >
                                            {charItem.char}
                                        </span>
                                    </span>
                                );
                            }

                            const style = richStyles[flatIndex] ?? getKaraokeCharStyle(charItem, baseCurrentMs, true);
                            const isSettlingLayer = keepRichLayer && !isFocused && richLayerState.settling;
                            const isExitLayer = keepRichLayer && !isFocused && !isSettlingLayer;
                            const exitStyle = isExitLayer ? {
                                animation: `karaoke-char-exit ${karaokeExitDurationMs}ms ease-in-out both`,
                                '--karaoke-char-exit-y': `${style.translateYEm.toFixed(4)}em`,
                                '--karaoke-char-exit-scale': style.scaleValue.toFixed(4),
                            } : isSettlingLayer ? {
                                animation: 'none',
                                transform: 'none',
                            } : undefined;

                            return (
                                <span
                                    key={charItem.charIndexInWord}
                                    ref={(el) => {
                                        wordRefs.current[flatIndex] = el;
                                    }}
                                    style={{
                                        position: 'relative',
                                        display: 'inline-block',
                                        whiteSpace: 'pre-wrap',
                                        transform: style.transform,
                                        willChange: isSettlingLayer ? 'auto' : style.willChange,
                                        transition: 'none',
                                        backfaceVisibility: 'hidden',
                                        overflow: 'visible',
                                        ...exitStyle,
                                    }}
                                >
                                    <span
                                        aria-hidden="true"
                                        ref={(el) => {
                                            glowRefs.current[flatIndex] = el;
                                        }}
                                        style={{
                                            position: 'absolute',
                                            inset: '-0.45em',
                                            padding: '0.45em',
                                            pointerEvents: 'none',
                                            whiteSpace: 'pre-wrap',
                                            color: 'rgba(255,255,255,0.95)',
                                            WebkitTextFillColor: 'rgba(255,255,255,0.95)',
                                            clipPath: 'none',
                                            maskImage: style.glowMask,
                                            WebkitMaskImage: style.glowMask,
                                            opacity: style.glowOpacity,
                                            textShadow: style.glowShadow,
                                            willChange: isSettlingLayer
                                                ? 'auto'
                                                : 'opacity, text-shadow, mask-image',
                                            transform: 'translateZ(0)',
                                            overflow: 'visible',
                                            animation: isExitLayer
                                                ? `karaoke-glow-exit ${karaokeExitDurationMs}ms ease-in-out both`
                                                : undefined,
                                            ...(isSettlingLayer ? {
                                                opacity: 0,
                                                textShadow: 'none',
                                            } : undefined),
                                        }}
                                    >
                                        {charItem.char}
                                    </span>
                                    <span
                                        ref={(el) => {
                                            fillRefs.current[flatIndex] = el;
                                        }}
                                        style={{
                                            position: 'relative',
                                            zIndex: 1,
                                            backgroundImage: style.fillBackgroundImage,
                                            WebkitBackgroundClip: 'text',
                                            backgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            color: 'transparent',
                                        }}
                                    >
                                        {charItem.char}
                                    </span>
                                </span>
                            );
                        })}
                    </span>
                );
            });

    return (
        <span style={{ display: 'block' }}>
            {!keepRichLayer && (
                <span style={{ display: 'block' }}>
                    {renderWordGroups(false)}
                </span>
            )}

            {keepRichLayer && (
                <span
                    aria-hidden={!isFocused || undefined}
                    style={{ display: 'block' }}
                >
                    {renderWordGroups(true)}
                </span>
            )}
        </span>
    );
}

const KaraokeText = memo(KaraokeTextBase, (prev, next) => {
    return (
        prev.words === next.words &&
        prev.lineEndMs === next.lineEndMs &&
        prev.nextLineStartMs === next.nextLineStartMs &&
        prev.enableTightHandoffTailCompression === next.enableTightHandoffTailCompression &&
        prev.preciseMsRef === next.preciseMsRef &&
        prev.isActive === next.isActive &&
        prev.isFocused === next.isFocused
    );
});

export default KaraokeText;
