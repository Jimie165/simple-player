import type { LyricsLine } from '@/types';
import { getTightHandoffVisualEndMs } from '@/features/player/lyrics/lyricCharSplitting';
import {
    interludeNextLineFocusLeadMs,
    interludeThresholdMs,
    nonInterludeNextLineFocusLeadMs,
    nonInterludeNextLineFocusThresholdMs,
} from '@/features/player/lyrics/constants';
import type { LyricsTimingStrategy } from '@/features/player/lyrics/timingStrategy';
import type { DisplayItem } from '@/features/player/lyrics/types';

interface DisplayTimelineEntry {
    displayIndex: number;
    timeMs: number;
}

interface DisplayTimelineIndex {
    interludes: Array<DisplayTimelineEntry & { endMs: number }>;
    lineDisplayIndices: Map<number, number>;
    timedLines: DisplayTimelineEntry[];
}

const displayTimelineCache = new WeakMap<DisplayItem[], DisplayTimelineIndex>();

const getDisplayTimelineIndex = (displayItems: DisplayItem[]) => {
    const cached = displayTimelineCache.get(displayItems);
    if (cached) return cached;

    const index: DisplayTimelineIndex = {
        interludes: [],
        lineDisplayIndices: new Map(),
        timedLines: [],
    };
    displayItems.forEach((item, displayIndex) => {
        if (item.type === 'interlude') {
            index.interludes.push({ displayIndex, timeMs: item.startMs, endMs: item.endMs });
            return;
        }
        index.lineDisplayIndices.set(item.lineIndex, displayIndex);
        if (typeof item.line.time_ms === 'number') {
            index.timedLines.push({ displayIndex, timeMs: item.line.time_ms });
        }
    });
    displayTimelineCache.set(displayItems, index);
    return index;
};

const findEntryAtOrBefore = <T extends DisplayTimelineEntry>(entries: T[], currentMs: number) => {
    let low = 0;
    let high = entries.length - 1;
    let result: T | null = null;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (entries[middle].timeMs <= currentMs) {
            result = entries[middle];
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return result;
};

export function getLineEndMsByIndex(lines: LyricsLine[], lineIndex: number): number | null {
    for (let index = lineIndex + 1; index < lines.length; index++) {
        const ms = lines[index].time_ms;
        if (typeof ms === 'number') return ms;
    }
    return null;
}

export function buildDisplayItems(
    lines: LyricsLine[],
    hasTimestamps: boolean,
    timingStrategy?: LyricsTimingStrategy
): DisplayItem[] {
    const items: DisplayItem[] = [];
    const enableTightHandoffTailCompression = timingStrategy?.compressTightHandoffTail ?? false;
    let lastLyricLineIndex = -1;
    let pendingEndMs: number | null = null;
    const displayLines = lines.map((line, index) => {
        const nextLineStartMs = getLineEndMsByIndex(lines, index);
        const hasWordTiming = Boolean(line.words?.length);
        const effectiveLineEndMs = typeof line.end_ms === 'number'
            ? line.end_ms
            : hasWordTiming
                ? nextLineStartMs
                : null;

        return {
            ...line,
            visual_end_ms: hasWordTiming
                ? getTightHandoffVisualEndMs(
                    line.words,
                    effectiveLineEndMs,
                    nextLineStartMs,
                    enableTightHandoffTailCompression
                )
                : null,
        };
    });

    for (let index = 0; index < displayLines.length; index++) {
        const line = displayLines[index];

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
    currentTime: number,
    timingStrategy?: LyricsTimingStrategy
) {
    if (!displayItems.length) return 0;

    const focusNextLineByVisualEnd = timingStrategy?.focusNextLineByVisualEnd ?? false;
    const leadMs = timingStrategy?.nextLineFocusLeadMs ?? nonInterludeNextLineFocusLeadMs;
    const enableLineLyricsEarlyFocus = timingStrategy?.enableLineLyricsEarlyFocus ?? false;
    const currentMs = currentTime * 1000;
    const timelineIndex = getDisplayTimelineIndex(displayItems);
    const interludeEntry = findEntryAtOrBefore(timelineIndex.interludes, currentMs);
    const interludeIndex = interludeEntry && currentMs < interludeEntry.endMs
        ? interludeEntry.displayIndex
        : -1;

    if (interludeIndex >= 0) {
        const item = displayItems[interludeIndex];
        if (item.type === 'interlude' && currentMs >= item.endMs - interludeNextLineFocusLeadMs) {
            return Math.min(displayItems.length - 1, interludeIndex + 1);
        }
        return interludeIndex;
    }

    const activeLineDisplayIndex = findEntryAtOrBefore(timelineIndex.timedLines, currentMs)?.displayIndex ?? -1;

    if (activeLineDisplayIndex >= 0) {
        const currentLineItem = displayItems[activeLineDisplayIndex];
        if (currentLineItem.type !== 'line') return activeLineDisplayIndex;
        const currentLine = currentLineItem.line;

        const nextTimedLineStartMs = getLineEndMsByIndex(lines, currentLineItem.lineIndex);
        const naturalLineEndMs = typeof currentLine.end_ms === 'number'
            ? currentLine.end_ms
            : nextTimedLineStartMs;
        const hasVisualEndMs =
            focusNextLineByVisualEnd &&
            typeof currentLine.visual_end_ms === 'number' &&
            (naturalLineEndMs === null || currentLine.visual_end_ms < naturalLineEndMs);
        const lineEndForFocusMs = hasVisualEndMs ? currentLine.visual_end_ms : naturalLineEndMs;

        // 对没有 wordTiming (逐行 LRC) 歌词提前 leadMs 聚焦切换
        const hasWordTiming = Boolean(currentLine.words?.length);
        if (!hasWordTiming && enableLineLyricsEarlyFocus) {
            const nextDisplayItem = displayItems[activeLineDisplayIndex + 1] ?? null;
            if (nextDisplayItem?.type === 'line') {
                const nextLineStartMs = lines[nextDisplayItem.lineIndex]?.time_ms;
                if (typeof nextLineStartMs === 'number' && typeof currentLine.time_ms === 'number') {
                    const gapMs = nextLineStartMs - currentLine.time_ms;
                    if (gapMs > leadMs) {
                        const focusNextLineAtMs = nextLineStartMs - leadMs;
                        if (currentMs >= focusNextLineAtMs) {
                            return activeLineDisplayIndex + 1;
                        }
                    }
                }
            }
        }

        if (typeof lineEndForFocusMs === 'number' && currentMs >= lineEndForFocusMs) {
            const nextDisplayItem = displayItems[activeLineDisplayIndex + 1] ?? null;

            if (nextDisplayItem?.type === 'line') {
                const nextLineStartMs = lines[nextDisplayItem.lineIndex]?.time_ms;
                if (typeof nextLineStartMs === 'number') {
                    if (hasVisualEndMs) {
                        return activeLineDisplayIndex + 1;
                    }

                    const gapMs = Math.max(0, nextLineStartMs - lineEndForFocusMs);
                    const focusNextLineAtMs =
                        gapMs > nonInterludeNextLineFocusThresholdMs
                            ? nextLineStartMs - leadMs
                            : lineEndForFocusMs;
                    if (currentMs >= focusNextLineAtMs) {
                        return activeLineDisplayIndex + 1;
                    }
                }
            }
        }

        return activeLineDisplayIndex;
    }

    const lineDisplayIndex = timelineIndex.lineDisplayIndices.get(currentLyricIndex) ?? -1;

    return lineDisplayIndex >= 0 ? lineDisplayIndex : 0;
}
