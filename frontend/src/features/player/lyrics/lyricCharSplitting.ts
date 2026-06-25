import type { LyricsWord } from '@/types';

const targetHandoffLeadMs = 400;
const tailMinDurationRatio = 0.5;
const tailMaxWindowMs = 800;
const tailMaxChars = 8;
const tailMinUsefulCutMs = 50;

export interface FlatCharItem {
    char: string;
    time_ms: number;       // 字符高亮的开始时间
    durationMs: number;    // 字符高亮的持续时间
    nextStart: number;     // 字符高亮的结束时间
    groupStartMs: number;  // 所属分组的整体开始时间（用于整体位移/长音）
    groupEndMs: number;    // 所属分组的整体结束时间
    groupDurationMs: number;// 所属分组的整体持续时间
    wordIndex: number;     // 单词索引，用以外层单词包裹和 Ref 寻址
    charIndexInWord: number;// 字符在单词内部的相对索引
    activeCharIndexInWord: number; // 非空白字符在单词内部的序号，空白符跟随上一字符
    activeCharCountInWord: number; // 单词内参与演唱动画的字符数量
}

/**
 * 将单词级别的歌词序列解析为扁平的、时值分摊到各个字母字符的序列。
 *
 * @param words 原始单词列表
 * @param lineEndMs 当前歌词行结束时间（用于决定最后一个词的默认时值）
 * @param nextLineStartMs 下一行歌词开始时间，用于短间隔时按缺口反推最小视觉压缩。
 */
export function parseLyricsWordsToChars(
    words: LyricsWord[],
    lineEndMs: number | null,
    nextLineStartMs: number | null = null
): FlatCharItem[] {
    const result: FlatCharItem[] = [];

    words.forEach((word, wordIndex) => {
        const nextStart = wordIndex + 1 < words.length
            ? words[wordIndex + 1].time_ms
            : lineEndMs ?? word.time_ms + 600;

        const calculatedDuration = word.duration_ms ?? Math.max(80, nextStart - word.time_ms);
        // 如果是最后一个单词且没有精确时间戳，限制其最长动画时值为 800ms，防止长间奏拖沓
        const isLastWord = wordIndex + 1 === words.length;
        const durationMs = (isLastWord && word.duration_ms === undefined)
            ? Math.min(800, calculatedDuration)
            : calculatedDuration;

        const chars = Array.from(word.text);
        const nonSpaceChars = chars.filter((c) => !/\s/.test(c));
        const nonSpaceCount = nonSpaceChars.length;

        let activeCharIndex = 0;
        chars.forEach((char, charIndex) => {
            const isWhitespace = /^\s$/.test(char);
            let charStart = word.time_ms;
            let charDuration = 0;
            const activeCharIndexInWord = Math.max(0, activeCharIndex - (isWhitespace ? 1 : 0));

            if (nonSpaceCount === 0) {
                // 如果全是空格，均分整个单词持续时间
                charDuration = durationMs / chars.length;
                charStart = word.time_ms + charIndex * charDuration;
            } else if (!isWhitespace) {
                // 字母或有意义字符依次平分单词时长
                charDuration = durationMs / nonSpaceCount;
                charStart = word.time_ms + activeCharIndex * charDuration;
                activeCharIndex++;
            } else {
                // 空格等空白符号不消耗主要渲染时长，其起止点紧跟在当时已播放的最新字符后
                charDuration = 0;
                charStart = word.time_ms + activeCharIndex * (durationMs / nonSpaceCount);
            }

            result.push({
                char,
                time_ms: charStart,
                durationMs: Math.max(20, charDuration), // 设定 20ms 的最小保护值以防止计算溢出
                nextStart: charStart + charDuration,
                groupStartMs: word.time_ms,
                groupEndMs: nextStart,
                groupDurationMs: durationMs,
                wordIndex,
                charIndexInWord: charIndex,
                activeCharIndexInWord,
                activeCharCountInWord: Math.max(1, nonSpaceCount),
            });
        });
    });

    return compressTightHandoffTail(result, lineEndMs, nextLineStartMs);
}

export function getTightHandoffVisualEndMs(
    words: LyricsWord[] | null | undefined,
    lineEndMs: number | null,
    nextLineStartMs: number | null
) {
    if (!words?.length || lineEndMs === null) return lineEndMs;
    const chars = parseLyricsWordsToChars(words, lineEndMs, null);
    const cutMs = getTightHandoffCompressionPlan(chars, lineEndMs, nextLineStartMs)?.cutMs ?? 0;
    return cutMs > 0 ? lineEndMs - cutMs : lineEndMs;
}

function compressTightHandoffTail(
    chars: FlatCharItem[],
    lineEndMs: number | null,
    nextLineStartMs: number | null
) {
    const plan = getTightHandoffCompressionPlan(chars, lineEndMs, nextLineStartMs);
    if (!plan) return chars;

    const { cutMs, tailIndices, tailDurationMs } = plan;
    const ratio = Math.max(tailMinDurationRatio, (tailDurationMs - cutMs) / tailDurationMs);
    const firstTailStartMs = chars[tailIndices[0]].time_ms;
    const tailIndexSet = new Set(tailIndices);
    let compressedCursorMs = firstTailStartMs;

    return chars.map((charItem, index) => {
        if (!tailIndexSet.has(index)) return charItem;

        const originalDurationMs = Math.max(20, charItem.durationMs);
        const compressedDurationMs = Math.max(20, originalDurationMs * ratio);
        const compressedStartMs = firstTailStartMs + (charItem.time_ms - firstTailStartMs) * ratio;
        const timeMs = Math.max(compressedCursorMs, compressedStartMs);
        const nextStart = timeMs + compressedDurationMs;
        compressedCursorMs = nextStart;

        const groupStartOffsetMs = Math.max(0, charItem.groupStartMs - firstTailStartMs);
        const groupStartMs = charItem.groupStartMs >= firstTailStartMs
            ? firstTailStartMs + groupStartOffsetMs * ratio
            : charItem.groupStartMs;
        const groupDurationMs = Math.max(20, charItem.groupDurationMs * ratio);
        const groupEndMs = Math.min(plan.visualEndMs, Math.max(nextStart, groupStartMs + groupDurationMs));

        return {
            ...charItem,
            time_ms: timeMs,
            durationMs: compressedDurationMs,
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
    const cutMs = Math.min(requiredCutMs, maxCutMs);
    if (cutMs < tailMinUsefulCutMs) return null;

    return {
        cutMs,
        tailIndices,
        tailDurationMs,
        visualEndMs: lineEndMs - cutMs,
    };
}

function getTightHandoffTailIndices(chars: FlatCharItem[], lineEndMs: number, requiredCutMs: number) {
    const result: number[] = [];
    let voicedCharCount = 0;
    const tailWindowStartMs = lineEndMs - tailMaxWindowMs;

    for (let index = chars.length - 1; index >= 0; index--) {
        const charItem = chars[index];
        if (charItem.nextStart < tailWindowStartMs) break;

        const isWhitespace = /^\s$/.test(charItem.char);
        const isPunctuation = /^\p{P}$/u.test(charItem.char);

        if (isWhitespace || isPunctuation) {
            if (result.length > 0) result.unshift(index);
            continue;
        }

        result.unshift(index);
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
        .filter(charItem => !/^\s$/.test(charItem.char) && !/^\p{P}$/u.test(charItem.char));
    if (voicedTail.length === 0) return 0;

    const startMs = voicedTail[0].time_ms;
    const endMs = Math.max(...voicedTail.map(charItem => charItem.nextStart));
    return Math.max(0, endMs - startMs);
}
