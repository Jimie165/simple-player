import type { BackendTimedLyricsLine, LyricsDocument, LyricsTimingMode } from '@/types';
import {
    analyzeInlineSquareKaraoke,
    classifyInlineSquareLine,
    collectInlineSquareStamps,
    tokenizeInlineSquare,
} from '@/utils/inlineSquareKaraoke';
import {
    buildLyricsLinesFromEntries,
    extractEnhancedWords,
    mergeLrcEntries,
    type LrcParsedEntry,
} from '@/utils/lyrics/convertLrcToLyricsDocument';

// SYLT（ID3 同步歌词）适配器：后端已给出逐行时间，只做
// 逐字时间戳提取、近时间翻译合并和统一的 line/word end 收尾。
export function convertTimedLinesToLyricsDocument(lines: BackendTimedLyricsLine[]): LyricsDocument {
    const timed: LrcParsedEntry[] = [];
    const untimed: Array<{ text: string; translation: string | null }> = [];
    const inlineSquareAnalysis = analyzeInlineSquareKaraoke(lines);

    for (const line of lines) {
        if (typeof line.time_ms === 'number') {
            // SYLT 行文本可能内嵌 <> 逐字时间戳，先尝试提取
            const extracted = extractEnhancedWords(line.text);
            const inlineSquareStamps = extracted ? [] : collectInlineSquareStamps(line.text);
            const inlineSquareDecision = extracted
                ? ({ kind: 'none' } as const)
                : classifyInlineSquareLine(inlineSquareStamps, line.text, {
                    ...inlineSquareAnalysis,
                    forceInlineSquareKaraoke: false,
                });
            const inlineSquare =
                inlineSquareDecision.kind === 'karaoke' ? tokenizeInlineSquare(inlineSquareStamps, line.text) : null;
            const lineEndOnly = inlineSquareDecision.kind === 'lineEndOnly' ? inlineSquareDecision : null;
            timed.push({
                time_ms: lineEndOnly ? lineEndOnly.lineTimeMs : inlineSquare ? inlineSquare.lineTimeMs : line.time_ms,
                text: extracted ? extracted.cleanText : (lineEndOnly ? lineEndOnly.cleanText : (inlineSquare ? inlineSquare.cleanText : line.text)),
                translation: line.translation ?? null,
                words: extracted ? extracted.words : (inlineSquare ? inlineSquare.words : null),
                end_ms:
                    extracted && extracted.endMs !== null
                        ? extracted.endMs
                        : (lineEndOnly ? lineEndOnly.endMs : (inlineSquare && inlineSquare.endMs !== null ? inlineSquare.endMs : null)),
                _raw: line.text,
            });
        } else {
            untimed.push({ text: line.text, translation: line.translation ?? null });
        }
    }

    timed.sort((a, b) => (a.time_ms ?? 0) - (b.time_ms ?? 0));
    const merged = mergeLrcEntries(timed);
    const outLines = buildLyricsLinesFromEntries(untimed, merged);

    const timingMode: LyricsTimingMode = outLines.some((line) => line.words.length > 0) ? 'word' : 'line';

    return {
        model: 'ttml',
        origin: 'sylt',
        timing_mode: timingMode,
        lines: outLines,
        metadata: {},
        offset_ms: 0,
    };
}
