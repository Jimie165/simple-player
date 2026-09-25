import { useInsertionEffect, useLayoutEffect, useMemo, useRef, memo, type RefObject } from 'react';
import type { LyricsWord } from '@/types';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';
import { useLyricsFrameTaskRegistry } from '@/features/player/lyrics/lyricsFrameScheduler';
import { getLyricsDebugSink } from '@/features/player/lyrics/lyricsDebug';

interface KaraokeTextProps {
    words: LyricsWord[];
    lineEndMs: number | null;
    nextLineStartMs?: number | null;
    enableTightHandoffTailCompression?: boolean;
    currentMs: number;
    preciseMsRef: RefObject<number>;
    isActive: boolean;
    isFocused: boolean;
    /** Animated panels provide the playback state so paused rows do not keep a frame loop. */
    isPlaying?: boolean;
    playbackSyncKey?: number;
    glowDisabled?: boolean;
    fillAlpha?: number;
}

type IndexedCharItem = {
    item: FlatCharItem;
    flatIndex: number;
};

type KaraokeCharStyle = {
    transform: string;
    fillStop: number;
    glowAlpha: number;
};

type KaraokeCharRuntime = {
    item: FlatCharItem;
    isLongTone: boolean;
    longToneAmount: number;
    glowToneAmount: number;
    fillEdgeWidth: number;
    fillLeftPx: number;
    fillWidthPx: number;
    fillMaskWidthPx: number;
    fillPaddingPx: number;
    charCount: number;
    charIndex: number;
    emphasisDurationMs: number;
    charDelayMs: number;
    motionAmount: number;
};

type WordMotionWindow = {
    startMs: number;
    endMs: number;
};

type KaraokeRuntimeState = {
    flatChars: FlatCharItem[];
    wordGroups: IndexedCharItem[][];
    wordMotionWindows: WordMotionWindow[];
    charRuntimes: Array<KaraokeCharRuntime | undefined>;
    previousTransforms: Array<string | undefined>;
    previousFillStops: Array<number | undefined>;
    previousGlowAlphas: Array<number | undefined>;
    wordPhaseCodes: Uint8Array;
    wordPhaseChanges: Uint8Array;
    wordStartOrder: number[];
    wordEndOrder: number[];
    startCursor: number;
    endCursor: number;
    activeWordIndices: Set<number>;
    changedWordIndices: number[];
    scratchStyle: KaraokeCharStyle;
    elements: Array<HTMLSpanElement | null>;
    lastTimeMs: number;
    needsVisualSync: boolean;
    forceVisualWrite: boolean;
    frameCallback: (() => void) | null;
    syncNow: (() => void) | null;
};

const karaokeExitDurationMs = 250;
const animationHeadstartMs = 100;
const syllableLiftEm = 0.078;
const restingCharTransform = 'translate(0, 0) scale(1)';
const cjkLayoutCharPattern = /^[\p{Unified_Ideograph}ࠀ-鿼]+$/u;
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

function prepareKaraokeCharRuntime(
    charItem: FlatCharItem,
    isLastWord: boolean,
): KaraokeCharRuntime {
    const longToneRaw = clamp01((charItem.groupDurationMs - 800) / 760);
    const longToneAmount = smoothstep(longToneRaw);
    const isLongTone = charItem.groupDurationMs > 800;
    const glowToneAmount = isLongTone
        ? Math.min(
            0.8,
            getDurationEmphasisAmount(Math.max(1000, charItem.groupDurationMs), 3000) *
            0.5 * (isLastWord ? 1.5 : 1)
        )
        : 0;
    const charCount = Math.max(1, charItem.activeCharCountInWord);
    const charIndex = Math.max(0, charItem.activeCharIndexInWord);
    const emphasisDurationMs = getEmphasisDurationMs(
        charItem.groupDurationMs,
        isLastWord
    );

    return {
        item: charItem,
        isLongTone,
        longToneAmount,
        glowToneAmount,
        fillEdgeWidth: 26 + longToneAmount * 18,
        fillLeftPx: 0,
        fillWidthPx: 0,
        fillMaskWidthPx: 0,
        fillPaddingPx: 0,
        charCount,
        charIndex,
        emphasisDurationMs,
        charDelayMs: (emphasisDurationMs / 2.5 / charCount) * charIndex,
        motionAmount: Math.min(
            1.2,
            getDurationEmphasisAmount(emphasisDurationMs, 2000) * 0.6
        ),
    };
}

function getKaraokeCharStyle(
    runtime: KaraokeCharRuntime,
    timeMs: number,
    wordFillHeadPx: number | null,
    glowDisabled = false,
    output: KaraokeCharStyle = { transform: '', fillStop: 0, glowAlpha: 0 },
): KaraokeCharStyle {
    const {
        item: charItem,
        isLongTone,
        longToneAmount,
        glowToneAmount,
        fillEdgeWidth,
        charCount,
        charIndex,
        emphasisDurationMs,
        charDelayMs,
        motionAmount,
    } = runtime;
    const {
        time_ms,
        durationMs,
        groupStartMs,
    } = charItem;
    const fillRawProgress = (timeMs - time_ms) / durationMs;
    const fillProgress = clamp01(fillRawProgress);
    const isFillComplete = fillRawProgress >= 1;
    const hasFillProgress = fillProgress > 0;

    const fillStop = wordFillHeadPx === null
        ? fillProgress * 100
        : (wordFillHeadPx - runtime.fillLeftPx + runtime.fillPaddingPx) / runtime.fillMaskWidthPx * 100;
    const elapsedMs = timeMs - time_ms;
    const hasStarted = elapsedMs > 0;
    const attackMs = Math.max(800, durationMs);
    const regularLift = hasStarted
        ? Math.sin(
            (clamp01(elapsedMs / attackMs) * Math.PI) / 2
        )
        : 0;

    const emphasisProgress = clamp01(
        (timeMs - groupStartMs - charDelayMs) /
        emphasisDurationMs
    );
    // Most words are shorter than the emphasis threshold. Avoid evaluating
    // the cubic curve for those characters while preserving the exact zero
    // result of the original multiplication.
    const emphasisCurve = longToneAmount > 0 || (!glowDisabled && glowToneAmount > 0)
        ? getEmphasisPulse(emphasisProgress)
        : 0;
    const emphasisPulse = emphasisCurve * longToneAmount;
    const glowPulse = emphasisCurve * glowToneAmount;
    const centerOffset = charCount / 2 - charIndex;
    const translateX =
        -emphasisPulse * 0.03 * motionAmount * centerOffset;
    const translateY = regularLift * -syllableLiftEm;
    const scale = 1 + emphasisPulse * 0.1 * motionAmount;

    output.transform = `translate3d(${translateX.toFixed(4)}em, ${translateY.toFixed(4)}em, 0) scale(${scale.toFixed(4)})`;
    output.fillStop = wordFillHeadPx !== null || hasFillProgress || isFillComplete
        ? fillStop
        : -(fillEdgeWidth + 1);
    // 辉光与缩放共用强调节奏，避免逐字填色把长音的辉光峰值推迟。
    output.glowAlpha = !isLongTone || glowDisabled ? 0 : glowPulse;
    return output;
}

function getWordMotionWindow(
    group: IndexedCharItem[],
    isLastWord: boolean
): WordMotionWindow {
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

const WORD_PHASE_FUTURE = 0;
const WORD_PHASE_MOTION = 1;
const WORD_PHASE_SETTLED = 2;

const getWordMotionOrders = (wordMotionWindows: WordMotionWindow[]) => {
    const indices = Array.from({ length: wordMotionWindows.length }, (_, index) => index)
        .filter(index => wordMotionWindows[index] !== undefined);
    return {
        starts: [...indices].sort((left, right) =>
            wordMotionWindows[left].startMs - wordMotionWindows[right].startMs || left - right
        ),
        ends: [...indices].sort((left, right) =>
            wordMotionWindows[left].endMs - wordMotionWindows[right].endMs || left - right
        ),
    };
};

function KaraokeTextBase({
    words,
    lineEndMs,
    nextLineStartMs = null,
    enableTightHandoffTailCompression = false,
    preciseMsRef,
    isActive,
    isFocused,
    isPlaying,
    playbackSyncKey,
    glowDisabled = false,
    fillAlpha = 1,
}: KaraokeTextProps) {
    const frameRegistry = useLyricsFrameTaskRegistry();
    const charRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const contentRef = useRef<HTMLSpanElement | null>(null);
    const wasFocusedRef = useRef(isFocused);
    const runtimeRef = useRef<KaraokeRuntimeState | null>(null);
    const isActiveRef = useRef(isActive);
    const isFocusedRef = useRef(isFocused);
    const glowDisabledRef = useRef(glowDisabled);

    useInsertionEffect(() => {
        if (glowDisabledRef.current !== glowDisabled && runtimeRef.current) {
            runtimeRef.current.needsVisualSync = true;
        }
        isActiveRef.current = isActive;
        isFocusedRef.current = isFocused;
        glowDisabledRef.current = glowDisabled;
    }, [glowDisabled, isActive, isFocused]);

    useLayoutEffect(() => () => {
        const runtime = runtimeRef.current;
        if (!runtime) return;
        getLyricsDebugSink()?.({
            type: 'karaoke-runtime',
            action: 'destroy',
            charCount: runtime.flatChars.length,
            wordCount: runtime.wordMotionWindows.length,
        });
    }, []);

    const flatChars = useMemo(
        () => parseLyricsWordsToChars(words, lineEndMs, {
            enabled: enableTightHandoffTailCompression,
            nextLineStartMs,
        }),
        [enableTightHandoffTailCompression, words, lineEndMs, nextLineStartMs]
    );

    const charRefCallbacks = useMemo(() => flatChars.map((_item, index) =>
        (element: HTMLSpanElement | null) => { charRefs.current[index] = element; }
    ), [flatChars]);

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

    // All values that only depend on the parsed lyric item are prepared once
    // per line. The frame callback then evaluates only the time-dependent
    // progress, avoiding repeated cubic/sqrt work and short-lived objects.
    const charRuntimes = useMemo(() => {
        const runtimes: Array<KaraokeCharRuntime | undefined> = [];
        wordGroups.forEach((group, wordIndex) => {
            const isLastWord = wordIndex === wordGroups.length - 1;
            group?.forEach(({ item, flatIndex }) => {
                runtimes[flatIndex] = prepareKaraokeCharRuntime(item, isLastWord);
            });
        });
        return runtimes;
    }, [wordGroups]);

    useLayoutEffect(() => {
        const charElements = charRefs.current;
        let runtime = runtimeRef.current;
        if (
            !runtime ||
            runtime.flatChars !== flatChars ||
            runtime.wordGroups !== wordGroups ||
            runtime.wordMotionWindows !== wordMotionWindows ||
            runtime.charRuntimes !== charRuntimes
        ) {
            const wordMotionOrders = getWordMotionOrders(wordMotionWindows);
            runtime = {
                flatChars,
                wordGroups,
                wordMotionWindows,
                charRuntimes,
                previousTransforms: new Array(flatChars.length),
                previousFillStops: new Array(flatChars.length),
                previousGlowAlphas: new Array(flatChars.length),
                wordPhaseCodes: new Uint8Array(wordMotionWindows.length),
                wordPhaseChanges: new Uint8Array(wordMotionWindows.length),
                wordStartOrder: wordMotionOrders.starts,
                wordEndOrder: wordMotionOrders.ends,
                startCursor: 0,
                endCursor: 0,
                activeWordIndices: new Set<number>(),
                changedWordIndices: [],
                scratchStyle: {
                    transform: '',
                    fillStop: 0,
                    glowAlpha: 0,
                },
                elements: [],
                lastTimeMs: Number.NaN,
                needsVisualSync: true,
                forceVisualWrite: false,
                frameCallback: null,
                syncNow: null,
            };
            runtime.wordPhaseCodes.fill(255);
            runtimeRef.current = runtime;
            getLyricsDebugSink()?.({
                type: 'karaoke-runtime',
                action: 'create',
                charCount: flatChars.length,
                wordCount: wordMotionWindows.length,
            });
        }

        const domChanged =
            runtime.elements.length !== charElements.length ||
            runtime.elements.some((element, index) => element !== charElements[index]);
        if (domChanged) {
            runtime.elements = [...charElements];
            runtime.previousTransforms.fill(undefined);
            runtime.previousFillStops.fill(undefined);
            runtime.previousGlowAlphas.fill(undefined);
            // The effect may be rerun for a focus change while the same DOM is
            // still mounted. Only a new set of nodes needs an initial cancel.
            charElements.forEach(element => {
                element?.style.setProperty('animation', 'none');
            });
        }

        // Keep one spatial fill head per timed word. Character transforms still
        // use their own clocks; only the mask edge crosses character boundaries.
        const wordFillWidths = wordGroups.map(group => {
            if (group.filter(({ item }) => !whitespaceLayoutCharPattern.test(item.char)).length < 2) return 0;
            const firstElement = charElements[group[0].flatIndex];
            if (!firstElement) return 0;
            const fontSize = parseFloat(getComputedStyle(firstElement).fontSize);
            if (!Number.isFinite(fontSize) || fontSize <= 0) return 0;
            let width = 0;
            group.forEach(({ flatIndex }) => {
                const element = charElements[flatIndex];
                const charRuntime = charRuntimes[flatIndex];
                if (!element || !charRuntime) return;
                const maskWidth = element.offsetWidth;
                const padding = fontSize * 0.1;
                const advance = Math.max(1, maskWidth - padding * 2);
                charRuntime.fillLeftPx = width;
                charRuntime.fillWidthPx = advance;
                charRuntime.fillMaskWidthPx = maskWidth;
                charRuntime.fillPaddingPx = padding;
                const featherPx = fontSize * (0.16 + charRuntime.longToneAmount * 0.1);
                element.style.setProperty('--kfe', String(featherPx / maskWidth * 100));
                width += advance;
            });
            return width;
        });

        const runtimeState = runtime;
        let debugWrites: { transform: number; fill: number; glow: number } | null = null;

        const updateCharStyles = (flatIndex: number, style: KaraokeCharStyle) => {
            const el = charElements[flatIndex];
            if (!el) return;
            // 退出过渡期间，不再覆写 transform 和发光，交由 CSS transition 处理；
            // 但保留 --kf 进度写入，确保未完成的刷白继续进行直到真正卸载。
            if (isFocusedRef.current) {
                if (runtime.forceVisualWrite || style.transform !== runtime.previousTransforms[flatIndex]) {
                    el.style.transform = style.transform;
                    runtime.previousTransforms[flatIndex] = style.transform;
                    if (debugWrites) debugWrites.transform++;
                }
                if (runtime.forceVisualWrite || style.glowAlpha !== runtime.previousGlowAlphas[flatIndex]) {
                    el.style.setProperty('--kg', String(style.glowAlpha));
                    runtime.previousGlowAlphas[flatIndex] = style.glowAlpha;
                    if (debugWrites) debugWrites.glow++;
                }
            }

            if (style.fillStop !== runtime.previousFillStops[flatIndex]) {
                el.style.setProperty('--kf', String(style.fillStop));
                runtime.previousFillStops[flatIndex] = style.fillStop;
                if (debugWrites) debugWrites.fill++;
            }
        };

        const updateWordStyles = (timeMs: number, forceAll = false, reason = 'normal') => {
            const debugSink = getLyricsDebugSink();
            debugWrites = debugSink ? { transform: 0, fill: 0, glow: 0 } : null;
            const changedWords = runtimeState.changedWordIndices;
            changedWords.length = 0;
            let evaluatedWordCount = 0;

            const markChanged = (wordIndex: number) => {
                if (runtimeState.wordPhaseChanges[wordIndex] !== 0) return;
                runtimeState.wordPhaseChanges[wordIndex] = 1;
                changedWords.push(wordIndex);
            };
            const setPhase = (wordIndex: number, phase: number) => {
                if (runtimeState.wordPhaseCodes[wordIndex] === phase) return;
                runtimeState.wordPhaseCodes[wordIndex] = phase;
                if (phase === WORD_PHASE_MOTION) runtimeState.activeWordIndices.add(wordIndex);
                else runtimeState.activeWordIndices.delete(wordIndex);
                markChanged(wordIndex);
            };
            const applyWord = (wordIndex: number) => {
                evaluatedWordCount++;
                const group = wordGroups[wordIndex];
                const wordFillWidth = wordFillWidths[wordIndex];
                let wordFillHeadPx: number | null = null;
                if (group && wordFillWidth > 0) {
                    const firstVoiced = group.find(({ item }) => !whitespaceLayoutCharPattern.test(item.char));
                    let lastVoiced: IndexedCharItem | undefined;
                    for (let index = group.length - 1; index >= 0; index--) {
                        if (!whitespaceLayoutCharPattern.test(group[index].item.char)) {
                            lastVoiced = group[index];
                            break;
                        }
                    }
                    if (firstVoiced && lastVoiced) {
                        const firstRuntime = charRuntimes[firstVoiced.flatIndex];
                        if (firstRuntime) {
                            const featherPx = firstRuntime.fillMaskWidthPx * firstRuntime.fillEdgeWidth / 100;
                            if (timeMs < firstVoiced.item.time_ms) {
                                wordFillHeadPx = -featherPx - 1;
                            } else if (timeMs >= lastVoiced.item.time_ms + lastVoiced.item.durationMs) {
                                const lastRuntime = charRuntimes[lastVoiced.flatIndex];
                                if (lastRuntime) wordFillHeadPx = lastRuntime.fillLeftPx + lastRuntime.fillWidthPx + featherPx;
                            } else {
                                group.forEach(({ item, flatIndex }) => {
                                    if (whitespaceLayoutCharPattern.test(item.char) || timeMs < item.time_ms) return;
                                    const charRuntime = charRuntimes[flatIndex];
                                    if (!charRuntime) return;
                                    const isFirst = flatIndex === firstVoiced.flatIndex;
                                    const isLast = flatIndex === lastVoiced.flatIndex;
                                    wordFillHeadPx = charRuntime.fillLeftPx - (isFirst ? featherPx : 0) +
                                        (charRuntime.fillWidthPx + (isFirst ? featherPx : 0) + (isLast ? featherPx : 0)) *
                                        clamp01((timeMs - item.time_ms) / item.durationMs);
                                });
                            }
                        }
                    }
                }
                group?.forEach(({ flatIndex }) => {
                    const charRuntime = charRuntimes[flatIndex];
                    if (!charRuntime) return;
                    const style = getKaraokeCharStyle(
                        charRuntime,
                        timeMs,
                        wordFillHeadPx,
                        glowDisabledRef.current,
                        runtimeState.scratchStyle,
                    );
                    updateCharStyles(flatIndex, style);
                });
            };

            const hasPreviousTime = Number.isFinite(runtimeState.lastTimeMs);
            const canAdvanceCursor = hasPreviousTime &&
                timeMs >= runtimeState.lastTimeMs &&
                timeMs - runtimeState.lastTimeMs <= 200 &&
                !forceAll;

            if (!canAdvanceCursor) {
                runtimeState.activeWordIndices.clear();
                runtimeState.startCursor = 0;
                runtimeState.endCursor = 0;
                wordMotionWindows.forEach((motionWindow, wordIndex) => {
                    if (!motionWindow) return;
                    const phase = timeMs < motionWindow.startMs
                        ? WORD_PHASE_FUTURE
                        : timeMs < motionWindow.endMs
                            ? WORD_PHASE_MOTION
                            : WORD_PHASE_SETTLED;
                    runtimeState.wordPhaseCodes[wordIndex] = phase;
                    if (phase === WORD_PHASE_MOTION) runtimeState.activeWordIndices.add(wordIndex);
                    applyWord(wordIndex);
                });
                while (
                    runtimeState.startCursor < runtimeState.wordStartOrder.length &&
                    timeMs >= wordMotionWindows[runtimeState.wordStartOrder[runtimeState.startCursor]].startMs
                ) runtimeState.startCursor++;
                while (
                    runtimeState.endCursor < runtimeState.wordEndOrder.length &&
                    timeMs >= wordMotionWindows[runtimeState.wordEndOrder[runtimeState.endCursor]].endMs
                ) runtimeState.endCursor++;
            } else {
                while (runtimeState.startCursor < runtimeState.wordStartOrder.length) {
                    const wordIndex = runtimeState.wordStartOrder[runtimeState.startCursor];
                    const motionWindow = wordMotionWindows[wordIndex];
                    if (!motionWindow || timeMs < motionWindow.startMs) break;
                    runtimeState.startCursor++;
                    setPhase(
                        wordIndex,
                        timeMs < motionWindow.endMs ? WORD_PHASE_MOTION : WORD_PHASE_SETTLED,
                    );
                }
                while (runtimeState.endCursor < runtimeState.wordEndOrder.length) {
                    const wordIndex = runtimeState.wordEndOrder[runtimeState.endCursor];
                    const motionWindow = wordMotionWindows[wordIndex];
                    if (!motionWindow || timeMs < motionWindow.endMs) break;
                    runtimeState.endCursor++;
                    setPhase(wordIndex, WORD_PHASE_SETTLED);
                }

                changedWords.forEach(wordIndex => {
                    if (runtimeState.wordPhaseCodes[wordIndex] !== WORD_PHASE_MOTION) applyWord(wordIndex);
                });
                runtimeState.activeWordIndices.forEach(applyWord);
            }

            if (debugSink) {
                debugSink({
                    type: 'karaoke-sync',
                    mode: canAdvanceCursor ? 'incremental' : 'full',
                    reason,
                    timeMs,
                    wordCount: wordMotionWindows.length,
                    charCount: flatChars.length,
                    evaluatedWordCount,
                    activeWordCount: runtimeState.activeWordIndices.size,
                });
                if (debugWrites) debugSink({ type: 'karaoke-style-writes', ...debugWrites });
            }
            runtimeState.forceVisualWrite = false;
            changedWords.forEach(wordIndex => {
                runtimeState.wordPhaseChanges[wordIndex] = 0;
            });
            changedWords.length = 0;
            debugWrites = null;
        };

        const tick = () => {
            const audioMs = preciseMsRef.current;
            if (Number.isFinite(audioMs) && (audioMs !== runtimeState.lastTimeMs || runtimeState.needsVisualSync)) {
                const hasPreviousTime =
                    Number.isFinite(runtimeState.lastTimeMs);
                const hasTimelineJump =
                    hasPreviousTime &&
                    (
                        audioMs < runtimeState.lastTimeMs ||
                        audioMs - runtimeState.lastTimeMs > 200
                    );
                const visualSync = runtimeState.needsVisualSync;
                updateWordStyles(
                    audioMs,
                    hasTimelineJump || visualSync,
                    hasTimelineJump ? 'timeline-jump' : visualSync ? 'visual-reacquire' : 'normal',
                );
                runtimeState.lastTimeMs = audioMs;
                runtimeState.needsVisualSync = false;
            }
        };

        const initialMs = preciseMsRef.current;
        if (initialMs !== null) {
            const hasTimelineJump = Number.isFinite(runtimeState.lastTimeMs) &&
                (initialMs < runtimeState.lastTimeMs || initialMs - runtimeState.lastTimeMs > 200);
            const visualSync = runtimeState.needsVisualSync;
            updateWordStyles(
                initialMs,
                domChanged || hasTimelineJump || visualSync,
                domChanged ? 'dom-change' : hasTimelineJump ? 'timeline-jump' : 'initial',
            );
            runtimeState.lastTimeMs = initialMs;
            runtimeState.needsVisualSync = false;
        }

        runtimeState.frameCallback = tick;
        runtimeState.syncNow = tick;

        return () => {
            if (runtimeState.frameCallback === tick) runtimeState.frameCallback = null;
            if (runtimeState.syncNow === tick) runtimeState.syncNow = null;
        };
    }, [
        preciseMsRef,
        flatChars,
        wordGroups,
        wordMotionWindows,
        charRuntimes,
    ]);

    // Focus and play/pause changes should only change ownership of the stable
    // frame callback. Recreating the callback for every handoff caused the
    // scheduler subscription set to churn at exactly the expensive boundary.
    useLayoutEffect(() => {
        const runtime = runtimeRef.current;
        if (!runtime?.frameCallback || !isActiveRef.current || isPlaying === false) return;
        const callback = runtime.frameCallback;
        let frame: number | null = null;
        let unsubscribe: (() => void) | undefined;
        if (frameRegistry) {
            unsubscribe = frameRegistry.subscribe(callback);
        } else {
            const loop = () => {
                callback();
                frame = requestAnimationFrame(loop);
            };
            frame = requestAnimationFrame(loop);
        }
        return () => {
            unsubscribe?.();
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [charRuntimes, flatChars, frameRegistry, isActive, isPlaying, preciseMsRef, wordGroups, wordMotionWindows]);

    useLayoutEffect(() => {
        const wasFocused = wasFocusedRef.current;
        wasFocusedRef.current = isFocused;

        if (isFocused) {
            const runtime = runtimeRef.current;
            // Stop the previous CSS owner before synchronizing the runtime,
            // including a paused reactivation at the very same media time.
            contentRef.current?.classList.remove('karaoke-text-exiting');
            if (runtime && !wasFocused) {
                runtime.needsVisualSync = true;
                runtime.forceVisualWrite = true;
                // A paused handoff has no scheduler frame to perform the
                // re-acquire. Synchronize immediately while still in layout.
                runtime.syncNow?.();
            }
            return;
        }

        if (!wasFocused) {
            contentRef.current?.classList.remove('karaoke-text-exiting');
            // 从未聚焦过（如初始非激活行）：无动画残留，直接归位
            charRefs.current.forEach((el) => {
                if (!el) return;
                el.style.transform = restingCharTransform;
                el.style.setProperty('--kg', '0');
            });
            return;
        }

        // 聚焦→失焦：行级退出过渡。只移除 inline transform/--kg（每字 2 次写入），
        // 由 .karaoke-text-exiting 的 transition 统一驱动退出动画，
        // 不再为每字写 4 个退出变量 + 创建 CSS 动画。
        const exitContent = contentRef.current;
        exitContent?.classList.add('karaoke-text-exiting');
        charRefs.current.forEach((el) => {
            if (!el) return;
            el.style.transform = '';
            el.style.removeProperty('--kg');
        });

        const releaseTimer = window.setTimeout(() => {
            if (contentRef.current !== exitContent || isFocusedRef.current) return;
            exitContent?.classList.remove('karaoke-text-exiting');
            charRefs.current.forEach((el) => {
                if (!el) return;
                el.style.transform = restingCharTransform;
                el.style.setProperty('--kg', '0');
            });
        }, karaokeExitDurationMs);

        return () => {
            window.clearTimeout(releaseTimer);
        };
    }, [flatChars, isFocused, preciseMsRef, wordGroups.length]);

    // These events invalidate playback state, not the DOM runtime. In
    // particular a paused seek has no content frame to refresh the fill.
    useLayoutEffect(() => {
        const runtime = runtimeRef.current;
        if (!runtime) return;
        runtime.syncNow?.();
    }, [glowDisabled, isActive, isPlaying, playbackSyncKey, preciseMsRef]);

    return (
        <span ref={contentRef} style={{ display: 'block' }}>
            <span
                style={{
                    display: 'block',
                    fontKerning: 'none',
                    fontVariantLigatures: 'none',
                    // 对于和声行（glowDisabled为true），强制基色保持偏暗，防止因任何状态抖动导致瞬间变成100%纯白
                    '--kb': (isActive || glowDisabled) ? 0.30 : 1,
                    '--kfa': fillAlpha,
                } as React.CSSProperties}
            >
                {layoutGroups.map((group) => {
                    if (!group || group.length === 0) return null;
                    const isCjkLayoutGroup = cjkLayoutCharPattern.test(group[0].item.char);

                    return (
                        <span
                            key={group[0].flatIndex}
                            style={{
                                display: 'inline-block',
                                whiteSpace: 'nowrap',
                                verticalAlign: 'bottom',
                                // Isolate Latin word groups, but leave CJK runs
                                // in the normal inline formatting context so
                                // glyph shaping and line metrics stay stable.
                                contain: isCjkLayoutGroup ? undefined : 'layout style',
                            }}
                        >
                            {group.map(({ item: charItem, flatIndex }) => {
                                const runtime = charRuntimes[flatIndex];
                                if (!runtime) return null;
                                const { isLongTone, longToneAmount, glowToneAmount, fillEdgeWidth } = runtime;
                                const fillEdgeAlpha = fillAlpha >= 1
                                    ? 0.72 + longToneAmount * 0.2
                                    : fillAlpha;
                                const baseAlpha = 0.30;
                                const fillEdgeMaskAlpha = fillAlpha > baseAlpha
                                    ? (fillEdgeAlpha - baseAlpha) / (fillAlpha * (1 - baseAlpha))
                                    : 1;

                                return (
                                    <span
                                        key={flatIndex}
                                        ref={charRefCallbacks[flatIndex]}
                                        className={isLongTone
                                            ? 'karaoke-char karaoke-char-long-tone'
                                            : 'karaoke-char'}
                                        data-c={charItem.char}
                                        style={{
                                            '--kfe': fillEdgeWidth,
                                            '--kfem': fillEdgeMaskAlpha,
                                            '--kgb': `${Math.min(0.3, glowToneAmount * 0.3)}em`,
                                        } as React.CSSProperties}
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
        prev.isFocused === next.isFocused &&
        prev.isPlaying === next.isPlaying &&
        prev.playbackSyncKey === next.playbackSyncKey &&
        prev.glowDisabled === next.glowDisabled &&
        prev.fillAlpha === next.fillAlpha
    );
});

export default KaraokeText;
