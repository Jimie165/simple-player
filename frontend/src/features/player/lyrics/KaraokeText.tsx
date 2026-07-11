import { useEffect, useMemo, useRef, memo, type RefObject } from 'react';
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
}

type IndexedCharItem = {
    item: FlatCharItem;
    flatIndex: number;
};

type KaraokeCharStyle = {
    transform: string;
    willChange: string;
    fillBackgroundImage: string;
    glowMask: string;
    glowOpacity: number;
    glowShadow: string;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
};
const emphasisEase = (value: number) => {
    const x = clamp01(value);
    if (x < 0.5) return smoothstep(x / 0.5);
    return smoothstep((1 - x) / 0.5);
};

function getLineFloatRelease(
    timeMs: number,
    lineFloatReleaseStartMs: number | null,
    lineEndMs: number | null
) {
    if (lineFloatReleaseStartMs === null || lineEndMs === null) return 1;
    const releaseDurationMs = lineEndMs - lineFloatReleaseStartMs;
    if (releaseDurationMs <= 0) return 1;
    return 1 - smoothstep((timeMs - lineFloatReleaseStartMs) / releaseDurationMs);
}

function getKaraokeCharStyle(
    charItem: FlatCharItem,
    timeMs: number,
    isActive: boolean = true,
    lineFloatReleaseStartMs: number | null = null,
    lineEndMs: number | null = null
): KaraokeCharStyle {
    const {
        time_ms,
        durationMs,
        groupStartMs,
        groupEndMs,
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
    const emphasisWave = emphasisEase(emphasisProgress);

    const releaseMs = Math.min(260, Math.max(130, groupDurationMs * 0.24));
    const release = smoothstep((groupEndMs - timeMs) / releaseMs);
    const attack = smoothstep((timeMs - groupStartMs) / Math.min(280, Math.max(140, groupDurationMs * 0.22)));
    const toneEnvelope = hasStarted ? Math.min(attack, release) : 0;
    const longToneEffect = longToneAmount * toneEnvelope;
    const emphasisEffect = longToneEffect * emphasisWave;

    const centerOffset = (charCount - 1) / 2 - charIndex;
    const lineFloatRelease = getLineFloatRelease(timeMs, lineFloatReleaseStartMs, lineEndMs);
    const translateX = -centerOffset * emphasisEffect * 0.03 * lineFloatRelease;
    const emphasisFloatProgress = clamp01((timeMs - (groupStartMs + charDelayMs - 400)) / (emphasisDurationMs * 1.4));
    const emphasisLift = Math.sin(emphasisFloatProgress * Math.PI) * longToneAmount;
    const translateY = (lift * -0.078 + emphasisLift * -0.07) * lineFloatRelease;
    const scale = 1 + emphasisEffect * 0.1;
    const glowOpacity = hasProgress ? emphasisEffect * (0.5 + progress * 0.35) : 0;
    const glowRadius = 2.5 + emphasisEffect * 9;
    const glowShadow = emphasisEffect > 0.01
        ? `0 0 ${Math.min(5, glowRadius * 0.45)}px rgba(255,255,255,${0.34 + emphasisEffect * 0.2}), 0 0 ${glowRadius}px rgba(255,255,255,${0.18 + emphasisEffect * 0.24})`
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
        transform: `translate3d(${translateX.toFixed(4)}em, ${translateY.toFixed(4)}em, 0) scale(${scale.toFixed(4)})`,
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
}: KaraokeTextProps) {
    const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const fillRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const glowRefs = useRef<Array<HTMLSpanElement | null>>([]);

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

    const lineFloatReleaseStartMs = useMemo(() => {
        if (flatChars.length === 0 || lineEndMs === null) return null;
        const lastVisualMs = Math.max(...flatChars.map(charItem =>
            Math.max(charItem.nextStart, charItem.groupEndMs)
        ));

        return lastVisualMs < lineEndMs ? lastVisualMs : null;
    }, [flatChars, lineEndMs]);

    useEffect(() => {
        if (!isActive) return;

        const updateWordStyles = (timeMs: number) => {
            flatChars.forEach((charItem, index) => {
                const el = wordRefs.current[index];
                const fillEl = fillRefs.current[index];
                const glowEl = glowRefs.current[index];
                if (!el || !fillEl || !glowEl) return;

                const style = getKaraokeCharStyle(
                    charItem,
                    timeMs,
                    true,
                    lineFloatReleaseStartMs,
                    lineEndMs
                );
                el.style.transform = style.transform;
                el.style.willChange = style.willChange;
                fillEl.style.backgroundImage = style.fillBackgroundImage;
                glowEl.style.maskImage = style.glowMask;
                glowEl.style.webkitMaskImage = style.glowMask;
                glowEl.style.opacity = String(style.glowOpacity);
                glowEl.style.textShadow = style.glowShadow;
            });
        };

        let frame: number;

        const tick = () => {
            updateWordStyles(preciseMsRef.current);
            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [flatChars, isActive, lineEndMs, lineFloatReleaseStartMs, preciseMsRef, wordGroups]);

    return (
        <>
            {wordGroups.map((group, wordIndex) => {
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
                            if (!isActive) {
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
                                                color: 'currentColor',
                                            }}
                                        >
                                            {charItem.char}
                                        </span>
                                    </span>
                                );
                            }

                            const style = getKaraokeCharStyle(
                                charItem,
                                baseCurrentMs,
                                isActive,
                                lineFloatReleaseStartMs,
                                lineEndMs
                            );

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
                                        willChange: style.willChange,
                                        transition: 'none',
                                        backfaceVisibility: 'hidden',
                                        overflow: 'visible',
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
                                            willChange: 'opacity, text-shadow, mask-image',
                                            transform: 'translateZ(0)',
                                            overflow: 'visible',
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
            })}
        </>
    );
}

const KaraokeText = memo(KaraokeTextBase, (prev, next) => {
    if (!prev.isActive && !next.isActive) {
        return prev.words === next.words &&
            prev.lineEndMs === next.lineEndMs &&
            prev.nextLineStartMs === next.nextLineStartMs &&
            prev.enableTightHandoffTailCompression === next.enableTightHandoffTailCompression;
    }

    return (
        prev.words === next.words &&
        prev.lineEndMs === next.lineEndMs &&
        prev.nextLineStartMs === next.nextLineStartMs &&
        prev.enableTightHandoffTailCompression === next.enableTightHandoffTailCompression &&
        prev.currentMs === next.currentMs &&
        prev.preciseMsRef === next.preciseMsRef &&
        prev.isActive === next.isActive
    );
});

export default KaraokeText;
