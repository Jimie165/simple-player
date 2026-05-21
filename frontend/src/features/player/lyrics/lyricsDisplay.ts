import type { LyricsLine } from '@/types';
import {
    interludeNextLineFocusLeadMs,
    interludeThresholdMs,
    nonInterludeNextLineFocusLeadMs,
    nonInterludeNextLineFocusThresholdMs,
} from '@/features/player/lyrics/constants';
import type { DisplayItem } from '@/features/player/lyrics/types';

export function getLineEndMsByIndex(lines: LyricsLine[], lineIndex: number): number | null {
    for (let index = lineIndex + 1; index < lines.length; index++) {
        const ms = lines[index].time_ms;
        if (typeof ms === 'number') return ms;
    }
    return null;
}

export function buildDisplayItems(lines: LyricsLine[], hasTimestamps: boolean): DisplayItem[] {
    const items: DisplayItem[] = [];
    let lastLyricLineIndex = -1;
    let pendingEndMs: number | null = null;

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        if (hasTimestamps && typeof line.time_ms === 'number' && line.text.length === 0) {
            if (pendingEndMs === null) pendingEndMs = line.time_ms;
            continue;
        }

        if (
            hasTimestamps &&
            typeof line.time_ms === 'number' &&
            lastLyricLineIndex < 0 &&
            line.time_ms >= interludeThresholdMs
        ) {
            items.push({
                type: 'interlude',
                afterLineIndex: -1,
                startMs: 0,
                endMs: line.time_ms,
            });
        }

        items.push({ type: 'line', line, lineIndex: index });

        if (
            hasTimestamps &&
            typeof line.time_ms === 'number' &&
            pendingEndMs !== null &&
            lastLyricLineIndex >= 0
        ) {
            const gapMs = line.time_ms - pendingEndMs;
            if (gapMs >= interludeThresholdMs) {
                items.splice(items.length - 1, 0, {
                    type: 'interlude',
                    afterLineIndex: lastLyricLineIndex,
                    startMs: pendingEndMs,
                    endMs: line.time_ms,
                });
            }
        }

        pendingEndMs = typeof line.end_ms === 'number' ? line.end_ms : null;
        if (typeof line.time_ms === 'number') lastLyricLineIndex = index;
    }

    return items;
}

export function getActiveDisplayIndex(
    displayItems: DisplayItem[],
    lines: LyricsLine[],
    currentLyricIndex: number,
    currentTime: number
) {
    if (!displayItems.length) return 0;

    const currentMs = currentTime * 1000;
    const leadingInterludeIndex = displayItems.findIndex((item) =>
        item.type === 'interlude' &&
        item.afterLineIndex === -1 &&
        currentMs >= item.startMs &&
        currentMs < item.endMs
    );

    if (leadingInterludeIndex >= 0) {
        const item = displayItems[leadingInterludeIndex];
        if (item.type === 'interlude' && currentMs >= item.endMs - interludeNextLineFocusLeadMs) {
            return Math.min(displayItems.length - 1, leadingInterludeIndex + 1);
        }
        return leadingInterludeIndex;
    }

    const currentLine = lines[currentLyricIndex];

    if (currentLine && typeof currentLine.time_ms === 'number') {
        const interludeIndex = displayItems.findIndex((item) =>
            item.type === 'interlude' &&
            item.afterLineIndex === currentLyricIndex &&
            currentMs >= item.startMs &&
            currentMs < item.endMs
        );

        if (interludeIndex >= 0) {
            const item = displayItems[interludeIndex];
            if (item.type === 'interlude' && currentMs >= item.endMs - interludeNextLineFocusLeadMs) {
                return Math.min(displayItems.length - 1, interludeIndex + 1);
            }
            return interludeIndex;
        }

        if (typeof currentLine.end_ms === 'number' && currentMs >= currentLine.end_ms) {
            const currentDisplayIndex = displayItems.findIndex((item) =>
                item.type === 'line' && item.lineIndex === currentLyricIndex
            );
            const nextDisplayItem =
                currentDisplayIndex >= 0 ? displayItems[currentDisplayIndex + 1] : null;

            if (nextDisplayItem?.type === 'line') {
                const nextLineStartMs = lines[nextDisplayItem.lineIndex]?.time_ms;
                if (typeof nextLineStartMs === 'number') {
                    const gapMs = Math.max(0, nextLineStartMs - currentLine.end_ms);
                    const focusNextLineAtMs =
                        gapMs > nonInterludeNextLineFocusThresholdMs
                            ? nextLineStartMs - nonInterludeNextLineFocusLeadMs
                            : currentLine.end_ms;
                    if (currentMs >= focusNextLineAtMs) {
                        return currentDisplayIndex + 1;
                    }
                }
            }
        }
    }

    const lineDisplayIndex = displayItems.findIndex((item) =>
        item.type === 'line' && item.lineIndex === currentLyricIndex
    );

    return lineDisplayIndex >= 0 ? lineDisplayIndex : 0;
}
