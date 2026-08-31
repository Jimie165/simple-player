import { useLayoutEffect, useMemo, useRef, memo, type RefObject } from 'react';
import type { LyricsWord } from '@/types';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';
import { useLyricsFrameTaskRegistry } from '@/features/player/lyrics/lyricsFrameScheduler';

interface KaraokeTextProps {
    words: LyricsWord[];
    lineEndMs: number | null;
    nextLineStartMs?: number | null;
    enableTightHandoffTailCompression?: boolean;
    currentMs: number;
    preciseMsRef: RefObject<number>;
    isActive: boolean;
    isFocused: boolean;
    /** Fluid panels provide the playback state so paused rows do not keep a frame loop. */
    isPlaying?: boolean;
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
        ? 0.3 + longToneAmount * 0.6
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

    const fillStop = fillProgress * 100;
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
    const glowReveal = isFillComplete
        ? 1
        : smoothstep(fillProgress);

    output.transform = `translate3d(${translateX.toFixed(4)}em, ${translateY.toFixed(4)}em, 0) scale(${scale.toFixed(4)})`;
    output.fillStop = hasFillProgress || isFillComplete ? fillStop : -(fillEdgeWidth + 1);
    output.glowAlpha = !isLongTone || glowDisabled ? 0 : glowPulse * glowReveal * 0.75;
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

function KaraokeTextBase({
    words,
    lineEndMs,
    nextLineStartMs = null,
    enableTightHandoffTailCompression = false,
    preciseMsRef,
    isActive,
    isFocused,
    isPlaying,
    glowDisabled = false,
    fillAlpha = 1,
}: KaraokeTextProps) {
    const frameRegistry = useLyricsFrameTaskRegistry();
    const charRefs = useRef<Array<HTMLSpanElement | null>>([]);
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
        if (!isActive) return;

        // Keep previous values as scalars. Returning a new style object for
        // every character on every frame creates avoidable GC pressure.
        const previousTransforms: Array<string | undefined> = [];
        const previousFillStops: Array<number | undefined> = [];
        const previousGlowAlphas: Array<number | undefined> = [];
        const charElements = charRefs.current;
        const scratchStyle: KaraokeCharStyle = {
            transform: '',
            fillStop: 0,
            glowAlpha: 0,
        };

        // 行级容器已有独立硬件合成层，字符级无需反复提升合成层，
        // 避免换行瞬间产生大量 Compositing Layer 创建/销毁开销。
        charElements.forEach((el) => {
            if (!el) return;
            el.style.animation = 'none';
        });

        const updateCharStyles = (flatIndex: number, style: KaraokeCharStyle) => {
            const el = charElements[flatIndex];
            if (!el) return;
            // 退出过渡期间，不再覆写 transform 和发光，交由 CSS transition 处理；
            // 但保留 --kf 进度写入，确保未完成的刷白继续进行直到真正卸载。
            if (isFocused || wasFocusedRef.current) {
                if (style.transform !== previousTransforms[flatIndex]) {
                    el.style.transform = style.transform;
                }
                if (style.glowAlpha !== previousGlowAlphas[flatIndex]) {
                    el.style.setProperty('--kg', String(style.glowAlpha));
                }
            }

            if (style.fillStop !== previousFillStops[flatIndex]) {
                el.style.setProperty('--kf', String(style.fillStop));
            }
            previousTransforms[flatIndex] = style.transform;
            previousFillStops[flatIndex] = style.fillStop;
            previousGlowAlphas[flatIndex] = style.glowAlpha;
        };

        const wordPhaseCodes = new Uint8Array(wordMotionWindows.length);
        const wordPhaseChanges = new Uint8Array(wordMotionWindows.length);
        wordPhaseCodes.fill(255);
        const updateWordStyles = (timeMs: number, forceAll = false) => {
            wordMotionWindows.forEach((motionWindow, wordIndex) => {
                const phase = timeMs < motionWindow.startMs
                    ? WORD_PHASE_FUTURE
                    : timeMs < motionWindow.endMs
                        ? WORD_PHASE_MOTION
                        : WORD_PHASE_SETTLED;
                const changed = wordPhaseCodes[wordIndex] !== phase;
                wordPhaseChanges[wordIndex] = changed ? 1 : 0;
                if (changed) {
                    wordPhaseCodes[wordIndex] = phase;
                }
            });

            wordMotionWindows.forEach((_motionWindow, wordIndex) => {
                const phase = wordPhaseCodes[wordIndex];
                if (!forceAll && phase !== WORD_PHASE_MOTION && wordPhaseChanges[wordIndex] === 0) return;
                wordGroups[wordIndex]?.forEach(({ flatIndex }) => {
                    const runtime = charRuntimes[flatIndex];
                    if (!runtime) return;
                    const style = getKaraokeCharStyle(
                        runtime,
                        timeMs,
                        glowDisabled,
                        scratchStyle,
                    );
                    updateCharStyles(flatIndex, style);
                });
            });
        };

        let frame: number | null = null;
        let lastTimeMs = Number.NaN;

        const tick = () => {
            const audioMs = preciseMsRef.current;
            if (audioMs !== null && audioMs !== lastTimeMs) {
                const hasPreviousTime =
                    Number.isFinite(lastTimeMs);
                const hasTimelineJump =
                    hasPreviousTime &&
                    (
                        audioMs < lastTimeMs ||
                        audioMs - lastTimeMs > 200
                    );
                updateWordStyles(audioMs, hasTimelineJump);
                lastTimeMs = audioMs;
            }
            if (!frameRegistry) frame = requestAnimationFrame(tick);
        };

        const initialMs = preciseMsRef.current;
        if (initialMs !== null) {
            updateWordStyles(initialMs, true);
            lastTimeMs = initialMs;
        }
        let unsubscribe: (() => void) | undefined;
        if (frameRegistry && isPlaying !== false) {
            unsubscribe = frameRegistry.subscribe(() => tick());
        } else if (!frameRegistry) {
            frame = requestAnimationFrame(tick);
        }

        return () => {
            unsubscribe?.();
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [
        isActive,
        isFocused,
        preciseMsRef,
        flatChars,
        wordGroups,
        wordMotionWindows,
        charRuntimes,
        glowDisabled,
        frameRegistry,
        isPlaying,
    ]);

    useLayoutEffect(() => {
        const wasFocused = wasFocusedRef.current;
        wasFocusedRef.current = isFocused;

        if (isFocused) {
            charRefs.current.forEach((el) => {
                if (!el) return;
                el.style.animation = 'none';
                el.classList.remove('karaoke-char-exiting');
            });
            return;
        }

        if (!wasFocused) {
            // 从未聚焦过（如初始非激活行）：无动画残留，直接归位
            charRefs.current.forEach((el) => {
                if (!el) return;
                el.style.transform = restingCharTransform;
                el.style.setProperty('--kg', '0');
            });
            return;
        }

        // 聚焦→失焦：行级退出过渡。只移除 inline transform/--kg（每字 2 次写入），
        // 由 .karaoke-char-exiting 的 transition 统一驱动退出动画，
        // 不再为每字写 4 个退出变量 + 创建 CSS 动画。
        const exitingClassName = 'karaoke-char-exiting';
        charRefs.current.forEach((el) => {
            if (!el) return;
            el.classList.add(exitingClassName);
            el.style.transform = '';
            el.style.removeProperty('--kg');
        });

        const releaseTimer = window.setTimeout(() => {
            charRefs.current.forEach((el) => {
                if (!el) return;
                el.classList.remove(exitingClassName);
                el.style.transform = restingCharTransform;
                el.style.setProperty('--kg', '0');
            });
        }, karaokeExitDurationMs);

        return () => {
            window.clearTimeout(releaseTimer);
        };
    }, [flatChars, isFocused, preciseMsRef, wordGroups.length, glowDisabled]);

    return (
        <span style={{ display: 'block' }}>
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
                                const { isLongTone, longToneAmount, fillEdgeWidth } = runtime;
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
                                        ref={(element) => {
                                            charRefs.current[flatIndex] = element;
                                        }}
                                        className={isLongTone
                                            ? 'karaoke-char karaoke-char-long-tone'
                                            : 'karaoke-char'}
                                        data-c={charItem.char}
                                        style={{
                                            '--kfe': fillEdgeWidth,
                                            '--kfem': fillEdgeMaskAlpha,
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
        prev.glowDisabled === next.glowDisabled &&
        prev.fillAlpha === next.fillAlpha
    );
});

export default KaraokeText;
