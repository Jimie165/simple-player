import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';

export function applyCharacterFillStyles(
    elements: Array<HTMLSpanElement | null>,
    runtimes: Array<{ fillEdgeWidth: number } | undefined>,
) {
    elements.forEach((element, index) => {
        if (element) element.style.setProperty('--kfe', String(runtimes[index]?.fillEdgeWidth ?? 26));
    });
}

export function getCharacterFillStop(item: FlatCharItem, fillEdgeWidth: number, timeMs: number): number {
    const progress = (timeMs - item.time_ms) / item.durationMs;
    return progress > 0 ? Math.min(1, progress) * 100 : -(fillEdgeWidth + 1);
}
