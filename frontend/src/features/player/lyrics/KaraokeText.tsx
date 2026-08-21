import { useLayoutEffect, useMemo, useRef, memo, type RefObject } from 'react';
import type { LyricsWord } from '@/types';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';
import { useLyricsFrameScheduler } from '@/features/player/lyrics/lyricsFrameScheduler';

interface KaraokeTextProps {
    words: LyricsWord[];
    lineEndMs: number | null;
    nextLineStartMs?: number | null;
    enableTightHandoffTailCompression?: boolean;
    currentMs: number;
    preciseMsRef: RefObject<number>;
    isActive: boolean;
    isFocused: boolean;
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

type WordPhase = 'future' | 'motion' | 'settled';
type WordMotionWindow = {
    startMs: number;
    endMs: number;
};

const animationHeadstartMs = 100;
const syllableLiftEm = 0.078;
const restingCharTransform = 'translate3d(0, 0, 0) scale(1)';
const settledLiftTransform = `translate3d(0.0000em, ${(-syllableLiftEm).toFixed(4)}em, 0) scale(1.0000)`;
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

function getKaraokeCharStyle(
    charItem: FlatCharItem,
    timeMs: number,
    isLastWord: boolean = false,
    glowDisabled = false
): KaraokeCharStyle {
    const {
        time_ms,
        durationMs,
        groupStartMs,
        groupDurationMs,
        activeCharIndexInWord,
        activeCharCountInWord,
    } = charItem;
    const fillRawProgress = (timeMs - time_ms) / durationMs;
    const fillProgress = clamp01(fillRawProgress);
    const isFillComplete = fillRawProgress >= 1;
    const hasFillProgress = fillProgress > 0;

    const longToneRaw = clamp01((groupDurationMs - 800) / 760);
    const longToneAmount = smoothstep(longToneRaw);
    const isLongTone = groupDurationMs > 800;
    const glowToneAmount = isLongTone
        ? 0.3 + smoothstep(longToneRaw) * 0.6
        : 0;
    const fillStop = fillProgress * 100;
    const fillEdgeWidth = 26 + longToneAmount * 18;
    const elapsedMs = timeMs - time_ms;
    const motionDurationMs = Math.max(800, durationMs);
    const regularLift = elapsedMs > 0
        ? Math.sin((clamp01(elapsedMs / motionDurationMs) * Math.PI) / 2)
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

    // 按实际输出精度判断 identity，避免 sin(PI) 的浮点残差留下
    // translate3d(0, -0.0000em, 0)，使已完成字符继续占用运动层。
    const renderedTranslateX = Number(translateX.toFixed(4));
    const renderedTranslateY = Number(translateY.toFixed(4));
    const renderedScale = Number(scale.toFixed(4));
    const transform = renderedTranslateX === 0 && renderedTranslateY === 0 && renderedScale === 1
        ? restingCharTransform
        : `translate3d(${renderedTranslateX.toFixed(4)}em, ${renderedTranslateY.toFixed(4)}em, 0) scale(${renderedScale.toFixed(4)})`;

    return {
        transform,
        fillStop: hasFillProgress || isFillComplete ? fillStop : -(fillEdgeWidth + 1),
        glowAlpha: !isLongTone || glowDisabled ? 0 : glowPulse * glowReveal * 0.75,
    };
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
    preciseMsRef,
    isActive,
    isFocused,
    glowDisabled = false,
    fillAlpha = 1,
}: KaraokeTextProps) {
    const frameScheduler = useLyricsFrameScheduler();
    const charRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const lineRef = useRef<HTMLSpanElement | null>(null);
    const settledLiftElementsRef = useRef(new Set<HTMLElement>());
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
        if (!isActive) return;

        const previousStyles: Array<KaraokeCharStyle | undefined> = [];
        const charElements = charRefs.current;

        const updateCharStyles = (flatIndex: number, style: KaraokeCharStyle) => {
            const el = charElements[flatIndex];
            if (!el) return;
            const previous = previousStyles[flatIndex];

            // 退出期间冻结字符运动和发光，让整行自身的退出动画统一承载视觉变化；
            // 但保留 --kf 进度写入，确保未完成的刷白继续进行直到真正卸载。
            if (isFocused) {
                if (style.transform === settledLiftTransform) {
                    settledLiftElementsRef.current.add(el);
                } else {
                    settledLiftElementsRef.current.delete(el);
                }
                if (style.transform !== previous?.transform) {
                    if (style.transform === restingCharTransform) {
                        el.style.removeProperty('transform');
                    } else {
                        el.style.transform = style.transform;
                    }
                }
                if (style.glowAlpha !== previous?.glowAlpha) {
                    if (style.glowAlpha === 0) el.style.removeProperty('--kg');
                    else el.style.setProperty('--kg', String(style.glowAlpha));
                }
            }

            if (style.fillStop !== previous?.fillStop) {
                if (style.fillStop <= 0) el.style.removeProperty('--kf');
                else el.style.setProperty('--kf', String(style.fillStop));
            }
            previousStyles[flatIndex] = style;
        };

        const updateWordStyles = (timeMs: number, forceAll = false) => {
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
                const isLastWord =
                    wordIndex === wordGroups.length - 1;
                wordGroups[wordIndex]?.forEach(({ item: charItem, flatIndex }) => {
                    const style = getKaraokeCharStyle(
                        charItem,
                        timeMs,
                        isLastWord,
                        glowDisabled
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
        };

        const initialMs = preciseMsRef.current;
        if (initialMs !== null) {
            const initialPhases = getWordPhases(
                wordMotionWindows,
                initialMs
            );
            wordPhaseKeyRef.current = getWordPhaseKey(initialPhases);
            updateWordStyles(initialMs, true);
            lastTimeMs = initialMs;
        }
        const unsubscribeFrame = frameScheduler
            ? frameScheduler.subscribe('content', tick)
            : undefined;
        const requestNextFrame = () => {
            frame = requestAnimationFrame(() => {
                tick();
                requestNextFrame();
            });
        };
        if (!frameScheduler) requestNextFrame();

        return () => {
            unsubscribeFrame?.();
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [
        isActive,
        preciseMsRef,
        flatChars,
        wordGroups,
        wordMotionWindows,
        glowDisabled,
        isFocused,
        frameScheduler,
    ]);

    useLayoutEffect(() => {
        const line = lineRef.current;
        const wasFocused = wasFocusedRef.current;
        wasFocusedRef.current = isFocused;

        if (isFocused) {
            line?.classList.remove('karaoke-line-exiting');
            line?.classList.remove('karaoke-line-reset');
            line?.classList.add('karaoke-line-exit-prepared');
            line?.querySelectorAll<HTMLElement>('.karaoke-char-exit-tail').forEach(element => {
                element.classList.remove('karaoke-char-exit-tail');
            });
            line?.querySelectorAll<HTMLElement>('.karaoke-char-long-tone').forEach(element => {
                element.classList.add('karaoke-char-motion');
            });
            return;
        }

        if (!wasFocused) {
            // CSS 默认值已经是静止态；不要在虚拟窗口挂载时逐字重复写入。
            return;
        }

        // 字符继续保持原有的逐字上浮。退出时由一个行级反向位移统一抵消
        // 已完成字符的上浮；只有尚未到达峰值的尾字符需要补齐到统一终点。
        line?.querySelectorAll<HTMLElement>('.karaoke-char[style*="transform"]').forEach(element => {
            if (!settledLiftElementsRef.current.has(element)) {
                element.classList.add('karaoke-char-exit-tail');
            }
        });
        line?.classList.add('karaoke-line-exiting');
        let cleanupFrame: number | null = null;
        const cleanupTimer = window.setTimeout(() => {
            // 行位移与字符上浮此时刚好互相抵消；切到等价的零状态后再分帧
            // 删除内联样式，不会在清理过程中逐字改变可见位置。
            line?.classList.add('karaoke-line-reset');
            const elements = Array.from(line?.querySelectorAll<HTMLElement>(
                '.karaoke-char[style*="transform"], .karaoke-char[style*="--kg"], .karaoke-char-motion'
            ) ?? []);
            const cleanupBatch = () => {
                elements.splice(0, 1).forEach(element => {
                    element.style.removeProperty('transform');
                    element.style.removeProperty('--kg');
                    element.classList.remove('karaoke-char-motion');
                    element.classList.remove('karaoke-char-exit-tail');
                    settledLiftElementsRef.current.delete(element);
                });
                if (elements.length > 0) {
                    cleanupFrame = requestAnimationFrame(cleanupBatch);
                    return;
                }
                line?.classList.remove('karaoke-line-exiting');
                line?.classList.remove('karaoke-line-reset');
                line?.classList.remove('karaoke-line-exit-prepared');
            };
            cleanupFrame = requestAnimationFrame(cleanupBatch);
        }, 280);
        return () => {
            clearTimeout(cleanupTimer);
            if (cleanupFrame !== null) cancelAnimationFrame(cleanupFrame);
        };
    }, [flatChars, glowDisabled, isFocused, preciseMsRef, wordGroups.length]);

    return (
        <span style={{ display: 'block' }}>
            <span
                ref={lineRef}
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
                                contain: isCjkLayoutGroup ? undefined : 'layout style',
                            }}
                        >
                            {group.map(({ item: charItem, flatIndex }) => {
                                const longToneRaw = clamp01((charItem.groupDurationMs - 800) / 760);
                                const longToneAmount = smoothstep(longToneRaw);
                                const isLongTone = charItem.groupDurationMs > 800;
                                const fillEdgeWidth = 26 + longToneAmount * 18;
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
        prev.glowDisabled === next.glowDisabled &&
        prev.fillAlpha === next.fillAlpha
    );
});

export default KaraokeText;
