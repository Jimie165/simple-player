import type { LyricsDocument } from '@/types';

// 规范化文档不变量：id 唯一、行文本去首尾空白、
// 丢弃完全空白的无时间行（timing-marker 因有 start 而保留）。
export function normalizeLyricsDocument(document: LyricsDocument): LyricsDocument {
    const seenIds = new Set<string>();
    const lines = document.lines
        .filter((line) => line.text.trim().length > 0 || line.start_time_ms !== null)
        .map((line, index) => {
            let id = line.id;
            if (!id || seenIds.has(id)) id = `line-${index + 1}`;
            seenIds.add(id);
            return {
                ...line,
                id,
                text: line.text.trim(),
                words: line.words.map((word) => ({ ...word })),
            };
        });

    return {
        model: 'ttml',
        origin: document.origin,
        timing_mode: document.timing_mode,
        lines,
        metadata: document.metadata ?? {},
        offset_ms: document.offset_ms ?? 0,
    };
}
