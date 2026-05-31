import type { LyricsLine } from '@/types';
import {
    interludeGapOpenDurationMs,
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
    const interludeIndex = displayItems.findIndex((item) =>
            item.type === 'interlude' &&
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

    let activeLineDisplayIndex = -1;
    for (let index = 0; index < displayItems.length; index++) {
        const item = displayItems[index];
        if (item.type !== 'line') continue;
        if (typeof item.line.time_ms !== 'number') continue;
        if (item.line.time_ms <= currentMs) activeLineDisplayIndex = index;
        else break;
    }

    if (activeLineDisplayIndex >= 0) {
        const currentLineItem = displayItems[activeLineDisplayIndex];
        if (currentLineItem.type !== 'line') return activeLineDisplayIndex;
        const currentLine = currentLineItem.line;

        if (typeof currentLine.end_ms === 'number' && currentMs >= currentLine.end_ms) {
            const nextDisplayItem =
                activeLineDisplayIndex >= 0 ? displayItems[activeLineDisplayIndex + 1] : null;

            if (nextDisplayItem?.type === 'line') {
                const nextLineStartMs = lines[nextDisplayItem.lineIndex]?.time_ms;
                if (typeof nextLineStartMs === 'number') {
                    const gapMs = Math.max(0, nextLineStartMs - currentLine.end_ms);
                    const focusNextLineAtMs =
                        gapMs > nonInterludeNextLineFocusThresholdMs
                            ? nextLineStartMs - nonInterludeNextLineFocusLeadMs
                            : currentLine.end_ms;
                    if (currentMs >= focusNextLineAtMs) {
                        return activeLineDisplayIndex + 1;
                    }
                }
            }
        }

        return activeLineDisplayIndex;
    }

    const lineDisplayIndex = displayItems.findIndex((item) =>
        item.type === 'line' && item.lineIndex === currentLyricIndex
    );

    return lineDisplayIndex >= 0 ? lineDisplayIndex : 0;
}

export function getInterludeExitIndexForPlaybackJump(
    displayItems: DisplayItem[],
    previousMs: number,
    currentMs: number
): number | null {
    if (Math.abs(currentMs - previousMs) < 900) return null;

    const findInterludeAt = (ms: number) => displayItems.findIndex((item) =>
        item.type === 'interlude' &&
        ms >= item.startMs &&
        ms < item.endMs
    );
    const previousActiveInterludeIndex = findInterludeAt(previousMs);
    const currentActiveInterludeIndex = findInterludeAt(currentMs);

    if (
        previousActiveInterludeIndex >= 0 &&
        previousActiveInterludeIndex === currentActiveInterludeIndex
    ) {
        return null;
    }

    const previousInterludeIndex = displayItems.findIndex((item) =>
        item.type === 'interlude' &&
        previousMs >= item.startMs + interludeGapOpenDurationMs &&
        previousMs < item.endMs - interludeNextLineFocusLeadMs
    );

    if (previousInterludeIndex < 0) return null;

    const previousInterlude = displayItems[previousInterludeIndex];
    if (previousInterlude?.type !== 'interlude') return null;

    const stillInSameInterlude =
        currentMs >= previousInterlude.startMs &&
        currentMs < previousInterlude.endMs;

    return stillInSameInterlude ? null : previousInterludeIndex;
}
