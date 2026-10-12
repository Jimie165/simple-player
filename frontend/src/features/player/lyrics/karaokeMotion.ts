import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';
import type { IndexedCharItem } from '@/features/player/lyrics/karaokeLayout';

export type KaraokeCharStyle = {
    transform: string;
    fillStop: number;
    glowAlpha: number;
};

export type KaraokeCharRuntime = {
    item: FlatCharItem;
    isLongTone: boolean;
    longToneAmount: number;
    glowToneAmount: number;
    fillEdgeWidth: number;
    fillLeftPx: number;
    fillWidthPx: number;
    fillMaskWidthPx: number;
    fillPaddingPx: number;
    fillFeatherPx: number;
    charCount: number;
    charIndex: number;
    emphasisDurationMs: number;
    wordEmphasisAttackMs: number;
    wordEmphasisReleaseMs: number;
    wordEmphasisReleaseStartMs: number;
    charDelayMs: number;
    motionAmount: number;
};

export type WordMotionWindow = {
    startMs: number;
    endMs: number;
};

export const karaokeExitDurationMs = 250;
const animationHeadstartMs = 100;
export const regularLiftMinDurationMs = 1000;
const longToneThresholdMs = 1000;
export const syllableLiftEm = 0.078;
export const restingCharTransform = 'translateY(0em)';
export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
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

const getWordEmphasisTiming = (durationMs: number, charCount: number, emphasisDurationMs: number) => {
    if (charCount === 1) {
        return { attackMs: emphasisDurationMs * 0.5, releaseMs: emphasisDurationMs * 0.7 };
    }
    const attackMs = Math.min(durationMs, Math.max(800, 2 * durationMs / charCount));
    return { attackMs, releaseMs: attackMs + 1200 };
};
const getWordEmphasisPulse = (elapsedMs: number, attackMs: number, releaseMs: number, releaseStartMs: number) => {
    return elapsedMs < attackMs
        ? evaluateCubicBezier(elapsedMs / attackMs, 0.42, 0, 0.58, 1)
        : 1 - evaluateCubicBezier(
            (elapsedMs - releaseStartMs) / releaseMs,
            0.25, 0, 0.3, 1
        );
};

export function prepareKaraokeCharRuntime(
    charItem: FlatCharItem,
    isLastWord: boolean,
    wordFloat = false,
): KaraokeCharRuntime {
    const longToneRaw = clamp01((charItem.groupDurationMs - longToneThresholdMs) / 760);
    const longToneAmount = smoothstep(longToneRaw);
    const isLongTone = charItem.groupDurationMs > longToneThresholdMs;
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
    const wordTiming = getWordEmphasisTiming(charItem.groupDurationMs, charCount, emphasisDurationMs);
    const charDelayMs = ((wordFloat ? charItem.groupDurationMs : emphasisDurationMs) / 2.5 / charCount) * charIndex;

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
        fillFeatherPx: 0,
        charCount,
        charIndex,
        emphasisDurationMs,
        wordEmphasisAttackMs: wordTiming.attackMs,
        wordEmphasisReleaseMs: wordTiming.releaseMs,
        // Layout replaces the timing fallback with the actual mask crossing.
        wordEmphasisReleaseStartMs: Math.max(
            charItem.groupStartMs + charDelayMs + wordTiming.attackMs,
            charItem.nextStart,
        ),
        charDelayMs,
        motionAmount: Math.min(
            1.2,
            getDurationEmphasisAmount(emphasisDurationMs, 2000) * 0.6
        ),
    };
}

export function getKaraokeCharStyle(
    runtime: KaraokeCharRuntime,
    timeMs: number,
    fillStop: number,
    glowDisabled = false,
    output: KaraokeCharStyle = { transform: '', fillStop: 0, glowAlpha: 0 },
    emphasisOnly = false,
): KaraokeCharStyle {
    const {
        item: charItem,
        isLongTone,
        longToneAmount,
        glowToneAmount,
        charCount,
        charIndex,
        emphasisDurationMs,
        wordEmphasisAttackMs,
        wordEmphasisReleaseMs,
        wordEmphasisReleaseStartMs,
        charDelayMs,
        motionAmount,
    } = runtime;
    const {
        time_ms,
        durationMs,
        groupStartMs,
    } = charItem;
    const elapsedMs = timeMs - time_ms;
    const hasStarted = elapsedMs > 0;
    const attackMs = Math.max(regularLiftMinDurationMs, durationMs);
    const regularLift = hasStarted
        ? Math.sin(
            (clamp01(elapsedMs / attackMs) * Math.PI) / 2
        )
        : 0;

    const emphasisElapsedMs = timeMs - groupStartMs - charDelayMs;
    // Most words are shorter than the emphasis threshold. Avoid evaluating
    // the cubic curve for those characters while preserving the exact zero
    // result of the original multiplication.
    const emphasisCurve = longToneAmount > 0 || (!glowDisabled && glowToneAmount > 0)
        ? emphasisOnly
            ? getWordEmphasisPulse(
                emphasisElapsedMs, wordEmphasisAttackMs, wordEmphasisReleaseMs,
                wordEmphasisReleaseStartMs - groupStartMs - charDelayMs,
            )
            : getEmphasisPulse(emphasisElapsedMs / emphasisDurationMs)
        : 0;
    // Let word-mode glyphs express the full duration-based emphasis,
    // including shorter sustained words.
    const emphasisPulse = emphasisCurve * (emphasisOnly ? 1 : longToneAmount);
    const glowPulse = emphasisCurve * glowToneAmount;
    const centerOffset = charCount / 2 - charIndex;
    const translateX =
        -emphasisPulse * 0.03 * motionAmount * centerOffset;
    // Sustained words distribute the same lift across their glyphs. Moving the
    // container as well would double the lift and hide the travelling wave.
    const translateY = emphasisOnly
        ? charCount > 1
            ? -syllableLiftEm * Math.sin(clamp01(emphasisElapsedMs / wordEmphasisAttackMs) * Math.PI / 2)
            : 0
        : regularLift * -syllableLiftEm;
    const scale = 1 + emphasisPulse * 0.1 * motionAmount;

    output.transform = isLongTone
        ? `translate3d(${translateX.toFixed(4)}em, ${translateY.toFixed(4)}em, 0) scale(${scale.toFixed(4)})`
        : `translateY(${translateY.toFixed(6)}em)`;
    output.fillStop = fillStop;
    // 辉光与缩放共用强调节奏，避免逐字填色把长音的辉光峰值推迟。
    output.glowAlpha = !isLongTone || glowDisabled ? 0 : glowPulse;
    return output;
}

export function getWordMotionWindow(
    group: IndexedCharItem[],
    isLastWord: boolean,
    wordFloat = false,
): WordMotionWindow {
    let startMs = Number.POSITIVE_INFINITY;
    let endMs = Number.NEGATIVE_INFINITY;

    group.forEach(({ item }) => {
        const liftEndMs = item.time_ms + Math.max(regularLiftMinDurationMs, item.durationMs);
        const progressionStartMs =
            item.groupStartMs - animationHeadstartMs;
        const progressionEndMs =
            item.groupStartMs + item.groupDurationMs;
        const hasLongToneMotion = item.groupDurationMs > longToneThresholdMs;
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
            ((wordFloat ? item.groupDurationMs : emphasisDurationMs) / 2.5 / charCount) * charIndex;
        const emphasisStartMs =
            item.groupStartMs + charDelayMs;
        const wordTiming = getWordEmphasisTiming(item.groupDurationMs, charCount, emphasisDurationMs);
        const emphasisEndMs = wordFloat
            ? Math.max(emphasisStartMs + wordTiming.attackMs, item.nextStart) + wordTiming.releaseMs
            : emphasisStartMs + emphasisDurationMs;
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

export const WORD_PHASE_FUTURE = 0;
export const WORD_PHASE_MOTION = 1;
export const WORD_PHASE_SETTLED = 2;

export const getWordMotionOrders = (wordMotionWindows: WordMotionWindow[]) => {
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

