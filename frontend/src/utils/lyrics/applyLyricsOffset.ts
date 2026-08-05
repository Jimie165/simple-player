import type { LyricsDocument } from '@/types';

// 歌词整体偏移（毫秒），在完整解析后一次性应用：
// 作用于 line start/end、word start/end、background start/end、background words 与 timing marker。
export function applyLyricsOffset(document: LyricsDocument, offsetMs: number): LyricsDocument {
    if (offsetMs === 0) return document;
    return {
        ...document,
        offset_ms: (document.offset_ms ?? 0) + offsetMs,
        lines: document.lines.map((line) => ({
            ...line,
            start_time_ms: line.start_time_ms !== null ? line.start_time_ms + offsetMs : null,
            end_time_ms: line.end_time_ms !== null ? line.end_time_ms + offsetMs : null,
            words: line.words.map((word) => ({
                ...word,
                start_time_ms: word.start_time_ms + offsetMs,
                end_time_ms:
                    word.end_time_ms !== undefined ? word.end_time_ms + offsetMs : undefined,
            })),
        })),
    };
}
