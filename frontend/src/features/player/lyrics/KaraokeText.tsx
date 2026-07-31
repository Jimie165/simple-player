import { useLayoutEffect, useMemo, useRef, memo, type RefObject } from 'react';
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
    translateXEm: number;
    translateYEm: number;
    scaleValue: number;
    fillBackgroundImage: string;
    glowShadow: string;
};

type WordPhase = 'future' | 'motion' | 'settled';
type WordMotionWindow = {
    startMs: number;
    endMs: number;
};

const karaokeExitDurationMs = 250;
const animationHeadstartMs = 100;
const syllableLiftEm = 0.078;
const completedFillBackground =
    'linear-gradient(to right, rgba(255,255,255,1), rgba(255,255,255,1))';
const transparentGlowShadow =
    '0 0 5px rgba(255,255,255,0)';
const restingCharTransform =
    'translate(0, 0) scale(1)';
const cjkLayoutCharPattern =
    /^[\p{Unified_Ideograph}\u0800-\u9FFC]+$/u;
const whitespaceLayoutCharPattern = /^\s+$/u;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
};
const evaluateCubicBezier = (
    value: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
) => {
    const x = clamp01(value);
    let parameter = x;

    for (let iteration = 0; iteration < 5; iteration++) {
        const inverse = 1 - parameter;
        const sampledX =
            3 * inverse * inverse * parameter * x1 +
            3 * inverse * parameter * parameter * x2 +
            parameter * parameter * parameter;
        const derivative =
            3 * inverse * inverse * x1 +
            6 * inverse * parameter * (x2 - x1) +
            3 * parameter * parameter * (1 - x2);
        if (Math.abs(derivative) < 0.0001) break;
        parameter = clamp01(
            parameter - (sampledX - x) / derivative
        );
    }

    const inverse = 1 - parameter;
    return (
        3 * inverse * inverse * parameter * y1 +
        3 * inverse * parameter * parameter * y2 +
        parameter * parameter * parameter
    );
};
const getDurationEmphasisAmount = (
    durationMs: number,
    divisorMs: number
) => {
    const ratio = durationMs / divisorMs;
    return ratio > 1 ? Math.sqrt(ratio) : Math.pow(ratio, 3);
};
const getEmphasisDurationMs = (
    groupDurationMs: number,
    isLastWord: boolean
) => (
    Math.max(1000, groupDurationMs) *
    (isLastWord ? 1.2 : 1)
);
const getEmphasisPulse = (value: number) => {
    const x = clamp01(value);
    return x < 0.5
        ? evaluateCubicBezier(
            x / 0.5,
            0.2,
            0.4,
            0.58,
            1
        )
        : 1 - evaluateCubicBezier(
            (x - 0.5) / 0.5,
            0.3,
            0,
            0.58,
            1
        );
};

function getKaraokeCharStyle(
    charItem: FlatCharItem,
    timeMs: number,
    isActive: boolean = true,
    isLastWord: boolean = false
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
    const fillRawProgress = (timeMs - time_ms) / durationMs;
    const fillProgress = clamp01(fillRawProgress);
    const isFillComplete = fillRawProgress >= 1;
    const hasFillProgress = fillProgress > 0;

    const longToneRaw = clamp01((groupDurationMs - 800) / 760);
    const longToneAmount = smoothstep(longToneRaw);
    const glowToneAmount = groupDurationMs > 800
        ? 0.3 + smoothstep(longToneRaw) * 0.6
        : 0;
    const fillStop = fillProgress * 100;
    const fillEdgeWidth = 26 + longToneAmount * 18;
    const fillEdgeAlpha = 0.72 + longToneAmount * 0.2;
    const fillEdgeStart = hasFillProgress
        ? Math.max(0, fillStop - fillEdgeWidth)
        : 0;
    const fillEdgeEnd = hasFillProgress
        ? Math.min(125, fillStop + fillEdgeWidth)
        : 0;
    const elapsedMs = timeMs - time_ms;
    const hasStarted = elapsedMs > 0;
    const attackMs = Math.max(800, durationMs);
    const regularLift = hasStarted
        ? Math.sin(
            (clamp01(elapsedMs / attackMs) * Math.PI) / 2
        )
        : 0;

    const charCount = Math.max(1, activeCharCountInWord);
    const charIndex = Math.max(0, activeCharIndexInWord);
    const emphasisDurationMs = getEmphasisDurationMs(
        groupDurationMs,
        isLastWord
    );
    const charDelayMs =
        (emphasisDurationMs / 2.5 / charCount) * charIndex;
    const emphasisProgress = clamp01(
        (timeMs - groupStartMs - charDelayMs) /
        emphasisDurationMs
    );
    const emphasisPulse =
        getEmphasisPulse(emphasisProgress) *
        longToneAmount;
    const motionAmount = Math.min(
        1.2,
        getDurationEmphasisAmount(emphasisDurationMs, 2000) * 0.6
    );
    const glowPulse =
        getEmphasisPulse(emphasisProgress) *
        glowToneAmount;
    const centerOffset = charCount / 2 - charIndex;
    const translateX =
        -emphasisPulse * 0.03 * motionAmount * centerOffset;
    const translateY = regularLift * -syllableLiftEm;
    const scale = 1 + emphasisPulse * 0.1 * motionAmount;
    const glowReveal = isFillComplete
        ? 1
        : smoothstep(fillProgress);
    const glowShadowAlpha =
        glowPulse * glowReveal * 0.75;
    const glowShadow =
        `0 0 5px rgba(255,255,255,${glowShadowAlpha.toFixed(4)})`;
    const fillBackgroundImage = isFillComplete
        ? completedFillBackground
        : hasFillProgress
            ? `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${fillEdgeStart}%, rgba(255,255,255,${fillEdgeAlpha}) ${fillStop}%, rgba(255,255,255,${baseAlpha}) ${fillEdgeEnd}%, rgba(255,255,255,${baseAlpha}) 100%)`
            : `linear-gradient(to right, rgba(255,255,255,${baseAlpha}), rgba(255,255,255,${baseAlpha}))`;

    return {
        transform: `translate3d(${translateX.toFixed(4)}em, ${translateY.toFixed(4)}em, 0) scale(${scale.toFixed(4)})`,
        translateXEm: translateX,
        translateYEm: translateY,
        scaleValue: scale,
        fillBackgroundImage,
        glowShadow,
    };
}

function getWordMotionWindow(
    group: IndexedCharItem[],
    isLastWord: boolean
) {
    let startMs = Number.POSITIVE_INFINITY;
    let endMs = Number.NEGATIVE_INFINITY;

    group.forEach(({ item }) => {
        const liftEndMs = item.time_ms + Math.max(800, item.durationMs);
        const progressionStartMs =
            item.groupStartMs - animationHeadstartMs;
        const progressionEndMs =
            item.groupStartMs + item.groupDurationMs;
        const hasLongToneMotion = item.groupDurationMs > 800;
        const emphasisDurationMs = getEmphasisDurationMs(
            item.groupDurationMs,
            isLastWord
        );
        const charCount = Math.max(
            1,
            item.activeCharCountInWord
        );
        const charIndex = Math.max(
            0,
            item.activeCharIndexInWord
        );
        const charDelayMs =
            (emphasisDurationMs / 2.5 / charCount) * charIndex;
        const emphasisStartMs =
            item.groupStartMs + charDelayMs;
        const emphasisEndMs =
            emphasisStartMs + emphasisDurationMs;
        startMs = Math.min(
            startMs,
            progressionStartMs,
            item.time_ms
        );
        endMs = Math.max(
            endMs,
            item.time_ms + item.durationMs,
            liftEndMs,
            progressionEndMs,
            hasLongToneMotion ? emphasisEndMs : liftEndMs
        );
    });

    return { startMs, endMs };
}

function getWordPhases(
    wordMotionWindows: WordMotionWindow[],
    timeMs: number
): WordPhase[] {
    return wordMotionWindows.map(({ startMs, endMs }) => {
        if (timeMs < startMs) return 'future';
        if (timeMs < endMs) return 'motion';
        return 'settled';
    });
}

const getWordPhaseKey = (phases: WordPhase[]) => phases
    .map(phase => phase === 'future' ? 'f' : phase === 'motion' ? 'm' : 's')
    .join('');

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
    const charRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const currentStylesRef =
        useRef<Array<KaraokeCharStyle | undefined>>([]);
    const wordPhaseKeyRef = useRef('');
    const wasFocusedRef = useRef(isFocused);

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
    const layoutGroups = useMemo(() => {
        const groups: IndexedCharItem[][] = [];
        let currentGroup: IndexedCharItem[] = [];
        const flushCurrentGroup = () => {
            if (currentGroup.length === 0) return;
            groups.push(currentGroup);
            currentGroup = [];
        };

        flatChars.forEach((charItem, flatIndex) => {
            const indexedChar = { item: charItem, flatIndex };
            if (whitespaceLayoutCharPattern.test(charItem.char)) {
                if (currentGroup.length > 0) {
                    currentGroup.push(indexedChar);
                    flushCurrentGroup();
                } else if (groups.length > 0) {
                    groups[groups.length - 1].push(indexedChar);
                }
                return;
            }
            if (cjkLayoutCharPattern.test(charItem.char)) {
                flushCurrentGroup();
                groups.push([indexedChar]);
                return;
            }
            currentGroup.push(indexedChar);
        });
        flushCurrentGroup();
        return groups;
    }, [flatChars]);
    const wordMotionWindows = useMemo(
        () => wordGroups.map((group, wordIndex) =>
            getWordMotionWindow(
                group,
                wordIndex === wordGroups.length - 1
            )
        ),
        [wordGroups]
    );

    useLayoutEffect(() => {
        if (!isActive || !isFocused) return;

        const previousStyles: Array<KaraokeCharStyle | undefined> = [];
        currentStylesRef.current = previousStyles;
        charRefs.current.forEach((element) => {
            if (!element) return;
            element.style.animation = 'none';
            element.style.willChange = 'transform';
            element.style.backfaceVisibility = 'hidden';
        });

        const updateWordStyles = (
            timeMs: number,
            forceAll: boolean = false
        ) => {
            const nextPhases = getWordPhases(
                wordMotionWindows,
                timeMs
            );
            const nextPhaseKey = getWordPhaseKey(nextPhases);
            const phaseChanged =
                nextPhaseKey !== wordPhaseKeyRef.current;
            if (phaseChanged) {
                wordPhaseKeyRef.current = nextPhaseKey;
            }

            nextPhases.forEach((phase, wordIndex) => {
                if (
                    !forceAll &&
                    !phaseChanged &&
                    phase !== 'motion'
                ) {
                    return;
                }
                const group = wordGroups[wordIndex];
                group?.forEach(({ item: charItem, flatIndex }) => {
                    const el = charRefs.current[flatIndex];
                    if (!el) return;

                    const style = getKaraokeCharStyle(
                        charItem,
                        timeMs,
                        true,
                        wordIndex === wordGroups.length - 1
                    );
                    const previousStyle = previousStyles[flatIndex];
                    if (style.transform !== previousStyle?.transform) {
                        el.style.transform = style.transform;
                    }
                    if (style.fillBackgroundImage !== previousStyle?.fillBackgroundImage) {
                        el.style.backgroundImage = style.fillBackgroundImage;
                    }
                    if (style.glowShadow !== previousStyle?.glowShadow) {
                        el.style.textShadow = style.glowShadow;
                    }
                    previousStyles[flatIndex] = style;
                });
            });
        };

        let frame: number;
        let lastTimeMs = Number.NaN;

        const tick = () => {
            const timeMs = preciseMsRef.current;
            if (timeMs !== lastTimeMs) {
                const hasPreviousTime =
                    Number.isFinite(lastTimeMs);
                const hasTimelineJump =
                    hasPreviousTime &&
                    (
                        timeMs < lastTimeMs ||
                        timeMs - lastTimeMs > 200
                    );
                updateWordStyles(timeMs, hasTimelineJump);
                lastTimeMs = timeMs;
            }
            frame = requestAnimationFrame(tick);
        };

        const initialTimeMs = preciseMsRef.current;
        const initialPhases = getWordPhases(
            wordMotionWindows,
            initialTimeMs
        );
        wordPhaseKeyRef.current = getWordPhaseKey(initialPhases);
        updateWordStyles(initialTimeMs, true);
        lastTimeMs = initialTimeMs;
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [
        isActive,
        isFocused,
        preciseMsRef,
        wordGroups,
        wordMotionWindows,
    ]);

    useLayoutEffect(() => {
        const wasFocused = wasFocusedRef.current;
        wasFocusedRef.current = isFocused;

        if (isFocused) {
            charRefs.current.forEach((element) => {
                if (!element) return;
                element.style.animation = 'none';
                element.style.willChange = 'transform';
                element.style.backfaceVisibility = 'hidden';
            });
            return;
        }

        const timeMs = preciseMsRef.current;
        flatChars.forEach((charItem, flatIndex) => {
            const element = charRefs.current[flatIndex];
            if (!element) return;

            element.style.backgroundImage = completedFillBackground;
            if (!wasFocused) {
                element.style.animation = 'none';
                element.style.transform = restingCharTransform;
                element.style.textShadow = transparentGlowShadow;
                element.style.removeProperty('will-change');
                element.style.removeProperty('backface-visibility');
                return;
            }

            const style =
                currentStylesRef.current[flatIndex] ??
                getKaraokeCharStyle(
                    charItem,
                    timeMs,
                    true,
                    charItem.wordIndex === wordGroups.length - 1
                );
            element.style.setProperty(
                '--karaoke-char-exit-x',
                `${style.translateXEm.toFixed(4)}em`
            );
            element.style.setProperty(
                '--karaoke-char-exit-y',
                `${style.translateYEm.toFixed(4)}em`
            );
            element.style.setProperty(
                '--karaoke-char-exit-scale',
                style.scaleValue.toFixed(4)
            );
            element.style.setProperty(
                '--karaoke-char-exit-shadow',
                style.glowShadow
            );
            element.style.animation =
                `karaoke-char-exit ${karaokeExitDurationMs}ms ease-in-out both`;
        });

        if (!wasFocused) {
            currentStylesRef.current = [];
            return;
        }

        let releaseFrame = 0;
        const releaseTimer = window.setTimeout(() => {
            releaseFrame = requestAnimationFrame(() => {
                charRefs.current.forEach((element) => {
                    if (!element) return;
                    element.style.transform = restingCharTransform;
                    element.style.textShadow = transparentGlowShadow;
                    element.style.animation = 'none';
                    element.style.removeProperty('will-change');
                    element.style.removeProperty('backface-visibility');
                });
                currentStylesRef.current = [];
            });
        }, karaokeExitDurationMs);

        return () => {
            window.clearTimeout(releaseTimer);
            cancelAnimationFrame(releaseFrame);
        };
    }, [flatChars, isFocused, preciseMsRef, wordGroups.length]);

    return (
        <span style={{ display: 'block' }}>
            <span
                style={{
                    display: 'block',
                    fontKerning: 'none',
                    fontVariantLigatures: 'none',
                }}
            >
                {layoutGroups.map((group) => {
                    if (!group || group.length === 0) return null;

                    return (
                        <span
                            key={group[0].flatIndex}
                            style={{
                                display: 'inline-block',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {group.map(({ item: charItem, flatIndex }) => {
                                const style = isFocused
                                    ? getKaraokeCharStyle(
                                        charItem,
                                        baseCurrentMs,
                                        true,
                                        charItem.wordIndex === wordGroups.length - 1
                                    )
                                    : null;

                                return (
                                    <span
                                        key={flatIndex}
                                        ref={(element) => {
                                            charRefs.current[flatIndex] = element;
                                        }}
                                        style={{
                                            position: 'relative',
                                            display: 'inline-block',
                                            whiteSpace: 'pre-wrap',
                                            transform:
                                                style?.transform ??
                                                restingCharTransform,
                                            transformOrigin: 'center',
                                            transition: 'none',
                                            overflow: 'visible',
                                            backgroundImage:
                                                style?.fillBackgroundImage ??
                                                completedFillBackground,
                                            WebkitBackgroundClip: 'text',
                                            backgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            color: 'transparent',
                                            textShadow:
                                                style?.glowShadow ??
                                                transparentGlowShadow,
                                        }}
                                    >
                                        {charItem.char}
                                    </span>
                                );
                            })}
                        </span>
                    );
                })}
            </span>
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
