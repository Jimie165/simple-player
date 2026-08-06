import type { LyricsDocument } from '@/types';

// 规范化文档不变量：id 唯一、行文本去首尾空白、
// 丢弃完全空白的无时间行（timing-marker 因有 start 而保留）。
export function normalizeLyricsDocument(document: LyricsDocument): LyricsDocument {
    const seenIds = new Set<string>();
    const latestMainIdBySourceId = new Map<string, string>();
    const lines = document.lines
        .filter((line) => line.text.trim().length > 0 || line.start_time_ms !== null)
        .map((line, index) => {
            const baseId = line.id || `line-${index + 1}`;
            let id = baseId;
            let suffix = 2;
            while (seenIds.has(id)) {
                id = `${baseId}-${suffix++}`;
            }
            seenIds.add(id);
            const parentId = line.parent_id
                ? latestMainIdBySourceId.get(line.parent_id) ?? line.parent_id
                : line.parent_id;
            if (line.role === 'main' && line.id) {
                latestMainIdBySourceId.set(line.id, id);
            }
            return {
                ...line,
                id,
                parent_id: parentId,
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
