import type { LyricsWord } from '@/types';

export interface FlatCharItem {
    char: string;
    time_ms: number;       // 字符高亮的开始时间
    durationMs: number;    // 字符高亮的持续时间
    nextStart: number;     // 字符高亮的结束时间
    wordStart: number;     // 所属单词的整体开始时间（用于长音发光波络）
    wordDurationMs: number;// 所属单词的整体持续时间（用于判断长音类型）
    wordNextStart: number; // 所属单词的整体结束时间（用于长音结束渐变）
    wordIndex: number;     // 单词索引，用以外层单词包裹和 Ref 寻址
    charIndexInWord: number;// 字符在单词内部的相对索引
    isWhitespace: boolean;  // 是否是空白字符
}

/**
 * 将单词级别的歌词序列解析为扁平的、时值分摊到各个字母字符的序列。
 *
 * @param words 原始单词列表
 * @param lineEndMs 当前歌词行结束时间（用于决定最后一个词的默认时值）
 */
export function parseLyricsWordsToChars(words: LyricsWord[], lineEndMs: number | null): FlatCharItem[] {
    const result: FlatCharItem[] = [];

    words.forEach((word, wordIndex) => {
        const nextStart = wordIndex + 1 < words.length
            ? words[wordIndex + 1].time_ms
            : lineEndMs ?? word.time_ms + 600;
        const durationMs = Math.max(80, nextStart - word.time_ms);

        const chars = Array.from(word.text);
        const nonSpaceChars = chars.filter((c) => !/\s/.test(c));
        const nonSpaceCount = nonSpaceChars.length;

        let activeCharIndex = 0;
        chars.forEach((char, charIndex) => {
            const isWhitespace = /^\s$/.test(char);
            let charStart = word.time_ms;
            let charDuration = 0;

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
                wordStart: word.time_ms,
                wordDurationMs: durationMs,
                wordNextStart: nextStart,
                wordIndex,
                charIndexInWord: charIndex,
                isWhitespace,
            });
        });
    });

    return result;
}
