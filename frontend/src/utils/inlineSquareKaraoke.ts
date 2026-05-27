import type { LyricsWord } from '@/types';

export const LRC_TIMESTAMP_RE = /\[(\d{2,}):(\d{2})(?:[.:](\d{2,3}))?\]/g;

export interface InlineSquareStamp {
    idx: number;
    len: number;
    ms: number;
}

export interface InlineSquareWords {
    words: LyricsWord[];
    cleanText: string;
    endMs: number | null;
    lineTimeMs: number;
}

export interface InlineSquareAnalysis {
    hasDefiniteKaraoke: boolean;
}

export type InlineSquareDecision =
    | { kind: 'karaoke' }
    | { kind: 'lineEndOnly'; lineTimeMs: number; cleanText: string; endMs: number }
    | { kind: 'none' };

export interface InlineSquareClassifyContext {
    hasDefiniteKaraoke: boolean;
    forceInlineSquareKaraoke?: boolean;
}

export function timestampMs(minutesRaw: string, secondsRaw: string, fractionRaw?: string): number {
    const minutes = parseInt(minutesRaw, 10);
    const seconds = parseInt(secondsRaw, 10);
    const fraction = fractionRaw ? parseInt(fractionRaw.padEnd(3, '0'), 10) : 0;
    return minutes * 60000 + seconds * 1000 + fraction;
}

function stampFromMatch(m: RegExpExecArray): InlineSquareStamp {
    return {
        idx: m.index,
        len: m[0].length,
        ms: timestampMs(m[1], m[2], m[3]),
    };
}

export function collectInlineSquareStamps(text: string): InlineSquareStamp[] {
    const stamps: InlineSquareStamp[] = [];
    LRC_TIMESTAMP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LRC_TIMESTAMP_RE.exec(text)) !== null) {
        stamps.push(stampFromMatch(m));
    }
    return stamps;
}

function getSegments(stamps: InlineSquareStamp[], text: string): string[] {
    const segments: string[] = [];
    for (let i = 0; i < stamps.length; i++) {
        const segStart = stamps[i].idx + stamps[i].len;
        const segEnd = i + 1 < stamps.length ? stamps[i + 1].idx : text.length;
        segments.push(text.slice(segStart, segEnd));
    }
    return segments;
}

function hasAnyTimedTextSegment(stamps: InlineSquareStamp[], text: string): boolean {
    return getSegments(stamps, text).some((segment) => segment.trim().length > 0);
}

function hasMultipleTimedTextSegments(stamps: InlineSquareStamp[], text: string): boolean {
    return getSegments(stamps, text).filter((segment) => segment.trim().length > 0).length >= 2;
}

function parseSingleSegmentLineEnd(stamps: InlineSquareStamp[], text: string): InlineSquareDecision {
    if (stamps.length !== 2) return { kind: 'none' };

    const beforeFirst = text.slice(0, stamps[0].idx);
    const between = text.slice(stamps[0].idx + stamps[0].len, stamps[1].idx);
    const afterSecond = text.slice(stamps[1].idx + stamps[1].len);

    if (beforeFirst.trim().length > 0) return { kind: 'none' };
    if (between.trim().length === 0) return { kind: 'none' };
    if (afterSecond.trim().length > 0) return { kind: 'none' };

    return {
        kind: 'lineEndOnly',
        lineTimeMs: stamps[0].ms,
        cleanText: between.trim(),
        endMs: stamps[1].ms,
    };
}

export function analyzeInlineSquareKaraoke(linesOrTexts: Array<string | { text: string }>): InlineSquareAnalysis {
    return {
        hasDefiniteKaraoke: linesOrTexts.some((line) => {
            const text = typeof line === 'string' ? line : line.text;
            const stamps = collectInlineSquareStamps(text);
            return stamps.length >= 3 && hasMultipleTimedTextSegments(stamps, text);
        }),
    };
}

export function classifyInlineSquareLine(
    stamps: InlineSquareStamp[],
    text: string,
    context: InlineSquareClassifyContext
): InlineSquareDecision {
    if (stamps.length < 2) return { kind: 'none' };
    if (!hasAnyTimedTextSegment(stamps, text)) return { kind: 'none' };

    if (context.forceInlineSquareKaraoke) return { kind: 'karaoke' };
    if (hasMultipleTimedTextSegments(stamps, text)) return { kind: 'karaoke' };

    const lineEndOnly = parseSingleSegmentLineEnd(stamps, text);
    if (lineEndOnly.kind === 'lineEndOnly' && !context.hasDefiniteKaraoke) {
        return lineEndOnly;
    }

    return { kind: context.hasDefiniteKaraoke ? 'karaoke' : 'none' };
}

export function tokenizeInlineSquare(stamps: InlineSquareStamp[], text: string): InlineSquareWords | null {
    if (stamps.length === 0) return null;

    const words: LyricsWord[] = [];
    let endMs: number | null = null;

    for (let i = 0; i < stamps.length; i++) {
        const segStart = stamps[i].idx + stamps[i].len;
        const segEnd = i + 1 < stamps.length ? stamps[i + 1].idx : text.length;
        const segText = text.slice(segStart, segEnd);
        if (segText.length === 0) {
            if (i === stamps.length - 1) endMs = stamps[i].ms;
            if (words.length > 0) {
                const prevWord = words[words.length - 1];
                if (prevWord.duration_ms === undefined) {
                    prevWord.duration_ms = stamps[i].ms - prevWord.time_ms;
                }
            }
            continue;
        }
        words.push({ time_ms: stamps[i].ms, text: segText });
    }

    if (words.length === 0) return null;

    return {
        words,
        cleanText: words.map((w) => w.text).join(''),
        endMs,
        lineTimeMs: stamps[0].ms,
    };
}
