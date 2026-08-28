import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';

export interface KaraokeWordMaskState {
    edgeWidthPx: number;
    fillPercent: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const smoothstep = (value: number) => {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
};

const getEdgeWidthPx = (charItem: FlatCharItem, charWidth: number) => {
    const longToneRaw = clamp01((charItem.groupDurationMs - 800) / 760);
    const longToneAmount = smoothstep(longToneRaw);
    return charWidth * (26 + longToneAmount * 18) / 100;
};

/**
 * Converts the existing per-character fill timeline into one spatial boundary
 * for a word-like layout group. Widths are measured once from the untransformed
 * character layout boxes, so differently sized Latin glyphs keep their exact
 * original timing instead of being swept at a uniform pixel speed.
 */
export function getKaraokeWordMaskState(
    chars: readonly FlatCharItem[],
    charWidths: readonly number[],
    timeMs: number,
    paddingLeftPx: number,
    totalWidthPx: number,
): KaraokeWordMaskState {
    const measuredContentWidth = charWidths.reduce(
        (sum, width) => sum + Math.max(0, width),
        0,
    );
    const safeTotalWidth = Math.max(
        1,
        totalWidthPx > 0
            ? totalWidthPx
            : measuredContentWidth + Math.max(0, paddingLeftPx) * 2,
    );
    const fallbackCharWidth = chars.length > 0
        ? Math.max(0, safeTotalWidth - Math.max(0, paddingLeftPx) * 2) / chars.length
        : 0;
    let filledWidth = 0;
    let edgeItem = chars.find(charItem => !/^\s+$/u.test(charItem.char)) ?? chars[0];
    let edgeCharWidth = charWidths[0] ?? fallbackCharWidth;

    for (let index = 0; index < chars.length; index++) {
        const charItem = chars[index];
        const charWidth = Math.max(0, charWidths[index] ?? fallbackCharWidth);
        const progress = clamp01(
            (timeMs - charItem.time_ms) / Math.max(1, charItem.durationMs),
        );
        if (!/^\s+$/u.test(charItem.char)) {
            edgeItem = charItem;
            edgeCharWidth = charWidth;
        }
        filledWidth += charWidth * progress;
        if (progress < 1) break;
    }

    // Match the original per-character mask at the exact start boundary:
    // padding only exists to protect glyph overhangs and must not count as
    // already-filled content. Keep the soft edge fully outside the word until
    // the first character has made real progress.
    const fillPercent = filledWidth > 0
        ? (
            Math.max(0, paddingLeftPx) + filledWidth
        ) / safeTotalWidth * 100
        : -25;

    return {
        edgeWidthPx: edgeItem
            ? getEdgeWidthPx(edgeItem, Math.max(0, edgeCharWidth))
            : 0,
        fillPercent: Math.min(125, Math.max(-25, fillPercent)),
    };
}
