import type { LyricsWord } from '@/types';

const targetHandoffLeadMs = 600;
const tailMinDurationRatio = 0.5;
const tailMaxWindowMs = 700;
const tailMaxChars = 8;
const tailMinUsefulCutMs = 50;

export interface FlatCharItem {
    char: string;
    time_ms: number;
    durationMs: number;
    nextStart: number;
    groupStartMs: number;
    groupEndMs: number;
    groupDurationMs: number;
    wordIndex: number;
    charIndexInWord: number;
    activeCharIndexInWord: number;
    activeCharCountInWord: number;
}

export interface TightHandoffTimingOptions {
    enabled?: boolean;
    nextLineStartMs?: number | null;
}

export function parseLyricsWordsToChars(
    words: LyricsWord[],
    lineEndMs: number | null,
    options: TightHandoffTimingOptions = {}
): FlatCharItem[] {
    const result: FlatCharItem[] = [];
    const { enabled = true, nextLineStartMs = null } = options;

    words.forEach((word, wordIndex) => {
        const nextStart = wordIndex + 1 < words.length
            ? words[wordIndex + 1].start_time_ms
            : lineEndMs ?? word.start_time_ms + 600;

        const hasExplicitEnd = word.end_time_ms !== undefined;
        const calculatedDuration = word.end_time_ms !== undefined
            ? Math.max(80, word.end_time_ms - word.start_time_ms)
            : Math.max(80, nextStart - word.start_time_ms);
        const isLastWord = wordIndex + 1 === words.length;
        const durationMs = (isLastWord && !hasExplicitEnd)
            ? Math.min(800, calculatedDuration)
            : calculatedDuration;

        const chars = Array.from(word.text);
        const nonSpaceChars = chars.filter((c) => !/\s/.test(c));
        const nonSpaceCount = nonSpaceChars.length;

        let activeCharIndex = 0;
        chars.forEach((char, charIndex) => {
            const isWhitespace = /^\s$/.test(char);
            let charStart = word.start_time_ms;
            let charDuration = 0;
            const activeCharIndexInWord = Math.max(0, activeCharIndex - (isWhitespace ? 1 : 0));

            if (nonSpaceCount === 0) {
                charDuration = durationMs / chars.length;
                charStart = word.start_time_ms + charIndex * charDuration;
            } else if (!isWhitespace) {
                charDuration = durationMs / nonSpaceCount;
                charStart = word.start_time_ms + activeCharIndex * charDuration;
                activeCharIndex++;
            } else {
                charDuration = 0;
                charStart = word.start_time_ms + activeCharIndex * (durationMs / nonSpaceCount);
            }

            result.push({
                char,
                time_ms: charStart,
                durationMs: Math.max(20, charDuration),
                nextStart: charStart + charDuration,
                groupStartMs: word.start_time_ms,
                groupEndMs: nextStart,
                groupDurationMs: durationMs,
                wordIndex,
                charIndexInWord: charIndex,
                activeCharIndexInWord,
                activeCharCountInWord: Math.max(1, nonSpaceCount),
            });
        });
    });

    return enabled ? compressTightHandoffTail(result, lineEndMs, nextLineStartMs) : result;
}

export function getTightHandoffVisualEndMs(
    words: LyricsWord[] | null | undefined,
    lineEndMs: number | null,
    nextLineStartMs: number | null,
    enabled = true
) {
    if (!enabled || !words?.length || lineEndMs === null) return lineEndMs;
    const chars = parseLyricsWordsToChars(words, lineEndMs, { enabled: false });
    const plan = getTightHandoffCompressionPlan(chars, lineEndMs, nextLineStartMs);
    return plan ? plan.visualEndMs : lineEndMs;
}

function compressTightHandoffTail(
    chars: FlatCharItem[],
    lineEndMs: number | null,
    nextLineStartMs: number | null
) {
    const plan = getTightHandoffCompressionPlan(chars, lineEndMs, nextLineStartMs);
    if (!plan) return chars;

    const { compressionCutMs, tailIndices, tailDurationMs } = plan;
    const ratio = Math.max(tailMinDurationRatio, (tailDurationMs - compressionCutMs) / tailDurationMs);
    const firstTailStartMs = chars[tailIndices[0]].time_ms;
    const tailIndexSet = new Set(tailIndices);
    let compressedCursorMs = firstTailStartMs;

    return chars.map((charItem, index) => {
        if (!tailIndexSet.has(index)) return charItem;

        const isDecoration = /^\s$/.test(charItem.char);
        const originalDurationMs = Math.max(20, charItem.durationMs);
        const compressedStartMs = firstTailStartMs + (charItem.time_ms - firstTailStartMs) * ratio;
        const compressedDurationMs = isDecoration
            ? Math.min(40, Math.max(20, originalDurationMs * ratio))
            : Math.max(20, originalDurationMs * ratio);
        const timeMs = isDecoration
            ? Math.max(firstTailStartMs, Math.min(compressedStartMs, compressedCursorMs - compressedDurationMs))
            : Math.max(compressedCursorMs, compressedStartMs);
        const nextStart = isDecoration
            ? Math.min(plan.compressedEndMs, timeMs + compressedDurationMs)
            : timeMs + compressedDurationMs;
        if (!isDecoration) compressedCursorMs = nextStart;

        const groupStartOffsetMs = Math.max(0, charItem.groupStartMs - firstTailStartMs);
        const groupStartMs = charItem.groupStartMs >= firstTailStartMs
            ? firstTailStartMs + groupStartOffsetMs * ratio
            : charItem.groupStartMs;
        const groupDurationMs = Math.max(20, charItem.groupDurationMs * ratio);
        const groupEndMs = Math.min(plan.compressedEndMs, Math.max(nextStart, groupStartMs + groupDurationMs));

        return {
            ...charItem,
            time_ms: timeMs,
            durationMs: Math.max(20, nextStart - timeMs),
            nextStart,
            groupStartMs,
            groupEndMs,
            groupDurationMs,
        };
    });
}

function getTightHandoffCompressionPlan(
    chars: FlatCharItem[],
    lineEndMs: number | null,
    nextLineStartMs: number | null
) {
    if (lineEndMs === null || nextLineStartMs === null || chars.length === 0) return null;

    const requiredCutMs = lineEndMs - (nextLineStartMs - targetHandoffLeadMs);
    if (requiredCutMs <= 0) return null;

    const tailIndices = getTightHandoffTailIndices(chars, lineEndMs, requiredCutMs);
    const tailDurationMs = getPlayableTailDurationMs(chars, tailIndices);
    if (tailDurationMs <= 0) return null;

    const maxCutMs = tailDurationMs * (1 - tailMinDurationRatio);
    const compressionCutMs = Math.min(requiredCutMs, maxCutMs);
    if (compressionCutMs < tailMinUsefulCutMs) return null;

    return {
        compressionCutMs,
        tailIndices,
        tailDurationMs,
        compressedEndMs: lineEndMs - compressionCutMs,
        visualEndMs: lineEndMs - compressionCutMs,
    };
}

function getTightHandoffTailIndices(chars: FlatCharItem[], lineEndMs: number, requiredCutMs: number) {
    const result: number[] = [];
    const pendingTrailingSpaces: number[] = [];
    let voicedCharCount = 0;
    const tailWindowStartMs = lineEndMs - tailMaxWindowMs;

    for (let index = chars.length - 1; index >= 0; index--) {
        const charItem = chars[index];
        if (charItem.nextStart < tailWindowStartMs) break;

        const isWhitespace = /^\s$/.test(charItem.char);

        if (isWhitespace) {
            if (result.length > 0) {
                result.unshift(index);
            } else {
                pendingTrailingSpaces.unshift(index);
            }
            continue;
        }

        result.unshift(index);
        if (pendingTrailingSpaces.length > 0) {
            result.push(...pendingTrailingSpaces);
            pendingTrailingSpaces.length = 0;
        }
        voicedCharCount++;

        const tailDurationMs = getPlayableTailDurationMs(chars, result);
        const payableCutMs = tailDurationMs * (1 - tailMinDurationRatio);
        if (payableCutMs >= requiredCutMs || voicedCharCount >= tailMaxChars) break;
    }

    return result;
}

function getPlayableTailDurationMs(chars: FlatCharItem[], tailIndices: number[]) {
    const voicedTail = tailIndices
        .map(index => chars[index])
        .filter(charItem => !/^\s$/.test(charItem.char));
    if (voicedTail.length === 0) return 0;

    const startMs = voicedTail[0].time_ms;
    const endMs = Math.max(...voicedTail.map(charItem => charItem.nextStart));
    return Math.max(0, endMs - startMs);
}
