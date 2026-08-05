import type { BackendTimedLyricsLine, LyricsDocument } from '@/types';

// 纯文本歌词：全部无时间，仅保留原文与翻译
export function createPlainLyricsDocument(lines: BackendTimedLyricsLine[]): LyricsDocument {
    const visibleLines = lines.filter((line) => line.text.trim().length > 0);
    return {
        model: 'ttml',
        origin: 'plain',
        timing_mode: 'none',
        lines: visibleLines.map((line, index) => ({
            id: `line-${index + 1}`,
            parent_id: null,
            role: 'main',
            start_time_ms: null,
            end_time_ms: null,
            text: line.text,
            words: [],
            translation: line.translation ?? null,
        })),
        metadata: {},
        offset_ms: 0,
    };
}
