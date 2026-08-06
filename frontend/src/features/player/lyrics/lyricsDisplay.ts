import type { LyricsLine } from '@/types';
import { getTightHandoffVisualEndMs } from '@/features/player/lyrics/lyricCharSplitting';
import {
    interludeGapOpenDurationMs,
    interludeNextLineFocusLeadMs,
    interludeThresholdMs,
    nonInterludeNextLineFocusLeadMs,
    nonInterludeNextLineFocusThresholdMs,
} from '@/features/player/lyrics/constants';
import type { LyricsTimingStrategy } from '@/features/player/lyrics/timingStrategy';
import type { DisplayItem } from '@/features/player/lyrics/types';

export interface ActiveLyricsState {
    focusIndex: number;
    activeIndices: Set<number>;
}

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
const nextTimedLineCache = new WeakMap<LyricsLine[], Array<number | null>>();

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
        // 时间轴只由主唱行驱动；背景行跟随父行激活，不参与焦点切换
        if (item.line.role === 'main' && typeof item.line.start_time_ms === 'number') {
            index.timedLines.push({ displayIndex, timeMs: item.line.start_time_ms });
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

const getFirstMainLineDisplayIndex = (displayItems: DisplayItem[]) => {
    const index = displayItems.findIndex(
        (item) => item.type === 'line' && item.line.role === 'main'
    );
    return index >= 0 ? index : 0;
};

interface TtmlLineWindows {
    lineIndices: number[];
    windowStartMs: number[];
    windowEndMs: number[];
}

// 主唱歌词的语义结束：最后词词尾优先，无词时回退 <p> 行尾。
// Apple 的 <p> end 会覆盖背景和声尾部，
// 用词尾判断重叠才不会让和声把主句拖到下一行结束。
const getMainLyricEndMs = (line: LyricsLine): number | null => {
    const words = line.words;
    if (words && words.length > 0) {
        const lastWord = words[words.length - 1];
        return lastWord.end_time_ms ?? lastWord.start_time_ms;
    }
    return line.end_time_ms;
};

const ttmlLineWindowsCache = new WeakMap<LyricsLine[], WeakMap<LyricsTimingStrategy, TtmlLineWindows>>();

export function getTtmlLineWindows(
    lines: LyricsLine[],
    timingStrategy?: LyricsTimingStrategy
): TtmlLineWindows {
    const strategyKey = timingStrategy ?? defaultTtmlLineWindowsStrategy;
    let strategyCache = ttmlLineWindowsCache.get(lines);
    if (!strategyCache) {
        strategyCache = new WeakMap();
        ttmlLineWindowsCache.set(lines, strategyCache);
    }
    const cached = strategyCache.get(strategyKey);
    if (cached) return cached;

    const leadMs = timingStrategy?.nextLineFocusLeadMs ?? nonInterludeNextLineFocusLeadMs;
    const compressTail = timingStrategy?.compressTightHandoffTail ?? false;

    const mains = lines
        .map((line, index) => ({
            index,
            line,
            start: line.start_time_ms,
        }))
        .filter((entry): entry is { index: number; line: LyricsLine; start: number } =>
            entry.line.role === 'main' && entry.start !== null
        )
        .sort((a, b) => a.start - b.start || a.index - b.index)
        .map((entry, i, sorted) => ({
            ...entry,
            // 行语义结束 = 主唱歌词词尾（<p> end 可能含背景和声尾部，不参与重叠判断）；
            // 无词尾时以下一主行起始兜底；末行无行尾则保持激活（与 LRC 一致）
            end: getMainLyricEndMs(entry.line) ?? (i + 1 < sorted.length ? sorted[i + 1].start : Number.POSITIVE_INFINITY),
        }));

    const count = mains.length;
    const lineIndices = new Array<number>(count);
    const windowStartMs = new Array<number>(count);
    const windowEndMs = new Array<number>(count);

    const overlaps = (i: number) => i > 0 && mains[i].start < mains[i - 1].end;

     // 窗口结束点：不依赖链结构，也不依赖相邻行的 windowEnd。
    for (let i = count - 1; i >= 0; i--) {
        lineIndices[i] = mains[i].index;
        const end = mains[i].end;
        const next = i + 1 < count ? mains[i + 1] : null;

        let windowEnd: number;
        if (next === null) {
            windowEnd = end;
        } else if (next.start < end) {
            // 与下一行重叠
            const nextNext = i + 2 < count ? mains[i + 2] : null;
            if (nextNext !== null && nextNext.start < next.end) {
                // 链继续：失活于「隔一行」的提前换行点，但不应早于本行语义结束
                windowEnd = Math.max(end, nextNext.start - leadMs);
            } else {
                // 链在此结束：如果本行和下一行是一起结束的（对唱组），同步使用下一行的退出时间
                // （这能保证下一行触发词尾加速压缩时，本行也同步压缩，不会导致本行反而更晚结束）。
                if (end <= next.end + 50) {
                    windowEnd = windowEndMs[i + 1];
                } else {
                    windowEnd = Math.max(end, windowEndMs[i + 1]);
                }
            }
        } else {
            // 不重叠：LRC 切换点（词尾加速复用）
            const visualEndMs = compressTail
                ? getTightHandoffVisualEndMs(mains[i].line.words, end, next.start, true)
                : null;
            if (visualEndMs !== null && visualEndMs < end) {
                windowEnd = visualEndMs;
            } else {
                const gapMs = Math.max(0, next.start - end);
                windowEnd = gapMs > nonInterludeNextLineFocusThresholdMs
                    ? next.start - leadMs
                    : end;
            }
        }
        windowEndMs[i] = windowEnd;
    }

    // 窗口开始点自前向后计算（依赖前一行的 windowEnd，已算好）。
    for (let i = 0; i < count; i++) {
        const start = mains[i].start;

        let windowStart: number;
        if (i === 0) {
            windowStart = start;
        } else if (i >= 2 && overlaps(i - 1) && overlaps(i)) {
            // 链中接管：前前行因链继续提前失活于自己的提前换行点，随其点亮
            windowStart = Math.max(0, start - leadMs);
        } else if (overlaps(i)) {
            // 与上一行重叠：b 开始播放即激活；上一行提前失活时随其点亮（不晚于自己语义开始）
            windowStart = Math.min(start, windowEndMs[i - 1]);
        } else {
            windowStart = windowEndMs[i - 1];
        }
        windowStartMs[i] = windowStart;
    }

    const windows = { lineIndices, windowStartMs, windowEndMs };
    strategyCache.set(strategyKey, windows);
    return windows;
}

const defaultTtmlLineWindowsStrategy: LyricsTimingStrategy = {
    compressTightHandoffTail: false,
    focusNextLineByVisualEnd: false,
    nextLineFocusLeadMs: nonInterludeNextLineFocusLeadMs,
};

function getTtmlActiveState(
    displayItems: DisplayItem[],
    lines: LyricsLine[],
    timelineIndex: DisplayTimelineIndex,
    currentMs: number,
    timingStrategy?: LyricsTimingStrategy
): ActiveLyricsState {
    const windows = getTtmlLineWindows(lines, timingStrategy);
    const activeLineIndices = new Set<number>();
    let lastStartedLineIndex = -1;

    for (let i = 0; i < windows.lineIndices.length; i++) {
        const lineIndex = windows.lineIndices[i];
        const startMs = lines[lineIndex].start_time_ms ?? 0;
        if (currentMs >= startMs) lastStartedLineIndex = lineIndex;
        if (currentMs >= windows.windowStartMs[i] && currentMs < windows.windowEndMs[i]) {
            activeLineIndices.add(lineIndex);
        }
    }

    // 焦点：激活行中已开始的最早者。重叠双亮时焦点保持在前一行（Apple：
    // 合声/重叠期间高亮不来回切换，直到组内全部熄灭才推进）；lineIndices
    // 按 start 排序，第一个匹配即最早。全部处于提前点亮窗口（未开始）时，
    // 从最近已开始行向链中下一行推进（a 失活时焦点切到 b 行）。
    let focusLineIndex = -1;
    for (let i = 0; i < windows.lineIndices.length; i++) {
        const lineIndex = windows.lineIndices[i];
        const startMs = lines[lineIndex].start_time_ms ?? 0;
        if (activeLineIndices.has(lineIndex) && currentMs >= startMs) {
            focusLineIndex = lineIndex;
            break;
        }
    }
    if (focusLineIndex < 0 && lastStartedLineIndex >= 0) {
        focusLineIndex = lastStartedLineIndex;
        if (!activeLineIndices.has(focusLineIndex)) {
            const position = windows.lineIndices.indexOf(focusLineIndex);
            const nextLineIndex =
                position >= 0 && position + 1 < windows.lineIndices.length
                    ? windows.lineIndices[position + 1]
                    : -1;
            if (nextLineIndex >= 0) focusLineIndex = nextLineIndex;
        }
    }

    // 背景和声跟随父行组激活
    if (activeLineIndices.size > 0) {
        const activeParentIds = new Set<string>();
        for (const lineIndex of activeLineIndices) {
            const line = lines[lineIndex];
            if (line.role === 'main' && line.id) activeParentIds.add(line.id);
        }
        if (activeParentIds.size > 0) {
            lines.forEach((line, lineIndex) => {
                if (
                    line.role === 'background' &&
                    line.parent_id != null &&
                    activeParentIds.has(line.parent_id)
                ) {
                    activeLineIndices.add(lineIndex);
                }
            });
        }
    }

    const activeIndices = new Set<number>();
    for (const lineIndex of activeLineIndices) {
        const displayIndex = timelineIndex.lineDisplayIndices.get(lineIndex);
        if (displayIndex !== undefined) activeIndices.add(displayIndex);
    }

    if (activeIndices.size === 0) {
        const fallbackIndex = getFirstMainLineDisplayIndex(displayItems);
        if (lastStartedLineIndex < 0) {
            // 歌曲尚未开始：回退第一主行
            return { focusIndex: fallbackIndex, activeIndices: new Set([fallbackIndex]) };
        }
        // 所有行已播放完：聚焦并保持最后已开始行激活（与 LRC 行为一致），
        // 而不是跳回开头第一句
        const lastDisplayIndex = timelineIndex.lineDisplayIndices.get(lastStartedLineIndex);
        if (lastDisplayIndex !== undefined) {
            return { focusIndex: lastDisplayIndex, activeIndices: new Set([lastDisplayIndex]) };
        }
        return { focusIndex: fallbackIndex, activeIndices: new Set([fallbackIndex]) };
    }

    let focusIndex: number;
    if (focusLineIndex >= 0) {
        focusIndex = timelineIndex.lineDisplayIndices.get(focusLineIndex) ?? [...activeIndices][0];
    } else {
        focusIndex = getFirstMainLineDisplayIndex(displayItems);
    }
    return { focusIndex, activeIndices };
}

// ===== LRC 时间轴 =====

function getLrcActiveState(
    displayItems: DisplayItem[],
    lines: LyricsLine[],
    timelineIndex: DisplayTimelineIndex,
    currentMs: number,
    timingStrategy?: LyricsTimingStrategy
): ActiveLyricsState {
    const focusNextLineByVisualEnd = timingStrategy?.focusNextLineByVisualEnd ?? false;
    const leadMs = timingStrategy?.nextLineFocusLeadMs ?? nonInterludeNextLineFocusLeadMs;
    const enableLineLyricsEarlyFocus = timingStrategy?.enableLineLyricsEarlyFocus ?? false;
    const activeLineDisplayIndex =
        findEntryAtOrBefore(timelineIndex.timedLines, currentMs)?.displayIndex ?? -1;

    if (activeLineDisplayIndex >= 0) {
        const currentLineItem = displayItems[activeLineDisplayIndex];
        if (currentLineItem.type !== 'line') {
            return {
                focusIndex: activeLineDisplayIndex,
                activeIndices: new Set([activeLineDisplayIndex]),
            };
        }
        const currentLine = currentLineItem.line;

        const nextTimedLineStartMs = getLineEndMsByIndex(lines, currentLineItem.lineIndex);
        const naturalLineEndMs = typeof currentLine.end_time_ms === 'number'
            ? currentLine.end_time_ms
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
                const nextLineStartMs = lines[nextDisplayItem.lineIndex]?.start_time_ms;
                if (typeof nextLineStartMs === 'number' && typeof currentLine.start_time_ms === 'number') {
                    const gapMs = nextLineStartMs - currentLine.start_time_ms;
                    if (gapMs > leadMs) {
                        const focusNextLineAtMs = nextLineStartMs - leadMs;
                        if (currentMs >= focusNextLineAtMs) {
                            return {
                                focusIndex: activeLineDisplayIndex + 1,
                                activeIndices: new Set([activeLineDisplayIndex + 1]),
                            };
                        }
                    }
                }
            }
        }

        if (typeof lineEndForFocusMs === 'number' && currentMs >= lineEndForFocusMs) {
            const nextDisplayItem = displayItems[activeLineDisplayIndex + 1] ?? null;

            if (nextDisplayItem?.type === 'line') {
                const nextLineStartMs = lines[nextDisplayItem.lineIndex]?.start_time_ms;
                if (typeof nextLineStartMs === 'number') {
                    if (hasVisualEndMs) {
                        return {
                            focusIndex: activeLineDisplayIndex + 1,
                            activeIndices: new Set([activeLineDisplayIndex + 1]),
                        };
                    }

                    const gapMs = Math.max(0, nextLineStartMs - lineEndForFocusMs);
                    const focusNextLineAtMs =
                        gapMs > nonInterludeNextLineFocusThresholdMs
                            ? nextLineStartMs - leadMs
                            : lineEndForFocusMs;
                    if (currentMs >= focusNextLineAtMs) {
                        return {
                            focusIndex: activeLineDisplayIndex + 1,
                            activeIndices: new Set([activeLineDisplayIndex + 1]),
                        };
                    }
                }
            }
        }

        return {
            focusIndex: activeLineDisplayIndex,
            activeIndices: new Set([activeLineDisplayIndex]),
        };
    }

    const fallbackIndex = getFirstMainLineDisplayIndex(displayItems);
    return { focusIndex: fallbackIndex, activeIndices: new Set([fallbackIndex]) };
}

// ===== 统一入口 =====

export function getActiveLyricsState(
    displayItems: DisplayItem[],
    lines: LyricsLine[],
    currentTime: number,
    timingStrategy?: LyricsTimingStrategy,
    isTtml = false
): ActiveLyricsState {
    if (!displayItems.length) return { focusIndex: -1, activeIndices: new Set() };

    const currentMs = currentTime * 1000;
    const timelineIndex = getDisplayTimelineIndex(displayItems);
    const interludeEntry = findEntryAtOrBefore(timelineIndex.interludes, currentMs);
    const interludeIndex = interludeEntry && currentMs < interludeEntry.endMs
        ? interludeEntry.displayIndex
        : -1;

    if (interludeIndex >= 0) {
        const item = displayItems[interludeIndex];
        if (item.type === 'interlude' && currentMs >= item.endMs - interludeNextLineFocusLeadMs) {
            const focusIndex = Math.min(displayItems.length - 1, interludeIndex + 1);
            return { focusIndex, activeIndices: new Set([focusIndex]) };
        }
        return { focusIndex: interludeIndex, activeIndices: new Set([interludeIndex]) };
    }

    if (isTtml) return getTtmlActiveState(displayItems, lines, timelineIndex, currentMs, timingStrategy);
    return getLrcActiveState(displayItems, lines, timelineIndex, currentMs, timingStrategy);
}


export function buildFluidLyricsRenderBoundaries(
    displayItems: DisplayItem[],
    lines: LyricsLine[],
    timingStrategy?: LyricsTimingStrategy,
    isTtml = false,
) {
    const boundaries = new Set<number>();
    const focusNextLineByVisualEnd = timingStrategy?.focusNextLineByVisualEnd ?? false;
    const leadMs = timingStrategy?.nextLineFocusLeadMs ?? nonInterludeNextLineFocusLeadMs;
    const enableLineLyricsEarlyFocus = timingStrategy?.enableLineLyricsEarlyFocus ?? false;
    const addBoundary = (timeMs: number | null | undefined) => {
        if (typeof timeMs === 'number' && Number.isFinite(timeMs) && timeMs >= 0) {
            boundaries.add(timeMs);
        }
    };

    displayItems.forEach((item, displayIndex) => {
        if (item.type === 'interlude') {
            addBoundary(item.startMs);
            addBoundary(item.startMs + interludeGapOpenDurationMs);
            addBoundary(item.endMs - interludeNextLineFocusLeadMs);
            addBoundary(item.endMs);
            return;
        }

        const line = item.line;
        const nextTimedLineStartMs = getLineEndMsByIndex(lines, item.lineIndex);
        const naturalLineEndMs = typeof line.end_time_ms === 'number'
            ? line.end_time_ms
            : nextTimedLineStartMs;
        const hasVisualEndMs =
            focusNextLineByVisualEnd &&
            typeof line.visual_end_ms === 'number' &&
            (naturalLineEndMs === null || line.visual_end_ms < naturalLineEndMs);

        addBoundary(line.start_time_ms);
        addBoundary(line.visual_end_ms);
        addBoundary(naturalLineEndMs);
        addBoundary(nextTimedLineStartMs);

        const nextDisplayItem = displayItems[displayIndex + 1];
        if (nextDisplayItem?.type !== 'line') return;
        const nextLineStartMs = lines[nextDisplayItem.lineIndex]?.start_time_ms;
        if (typeof nextLineStartMs !== 'number') return;

        if (!line.words?.length && enableLineLyricsEarlyFocus && typeof line.start_time_ms === 'number') {
            if (nextLineStartMs - line.start_time_ms > leadMs) addBoundary(nextLineStartMs - leadMs);
        }

        if (hasVisualEndMs || typeof naturalLineEndMs !== 'number') return;
        const gapMs = Math.max(0, nextLineStartMs - naturalLineEndMs);
        addBoundary(
            gapMs > nonInterludeNextLineFocusThresholdMs
                ? nextLineStartMs - leadMs
                : naturalLineEndMs,
        );
    });

    if (isTtml) {
        // 激活窗口的切换点（含重叠链的提前换行点），保证跨窗口时强制重渲染
        const windows = getTtmlLineWindows(lines, timingStrategy);
        for (let i = 0; i < windows.windowStartMs.length; i++) {
            addBoundary(windows.windowStartMs[i]);
            addBoundary(windows.windowEndMs[i]);
        }
    }

    return [...boundaries].sort((left, right) => left - right);
}

export function getFluidLyricsRenderKey(boundaries: number[], currentMs: number) {
    let low = 0;
    let high = boundaries.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (boundaries[middle] <= currentMs) low = middle + 1;
        else high = middle;
    }
    return low;
}

export function getLineEndMsByIndex(lines: LyricsLine[], lineIndex: number): number | null {
    let nextTimedLines = nextTimedLineCache.get(lines);
    if (!nextTimedLines) {
        nextTimedLines = new Array<number | null>(lines.length).fill(null);
        let nextTimeMs: number | null = null;
        for (let index = lines.length - 1; index >= 0; index--) {
            nextTimedLines[index] = nextTimeMs;
            if (lines[index].role === 'main' && typeof lines[index].start_time_ms === 'number') {
                nextTimeMs = lines[index].start_time_ms;
            }
        }

        // TTML 的多演唱者行可能按 agent 分组写入，源码顺序不一定等于播放顺序。
        // 主行的“下一行”必须按实际开始时间计算，否则倒序行会把词尾压缩到已经
        // 开始过的另一声部。非主行仍保留上面的源码顺序回退（供 timing marker 使用）。
        const timedMainLines = lines
            .map((line, index) => ({ index, start: line.start_time_ms, role: line.role }))
            .filter((entry): entry is { index: number; start: number; role: LyricsLine['role'] } =>
                entry.role === 'main' && entry.start !== null
            )
            .sort((left, right) => left.start - right.start || left.index - right.index);
        timedMainLines.forEach((entry, index) => {
            nextTimedLines![entry.index] = timedMainLines[index + 1]?.start ?? null;
        });
        nextTimedLineCache.set(lines, nextTimedLines);
    }
    return nextTimedLines[lineIndex] ?? null;
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
        const effectiveLineEndMs = typeof line.end_time_ms === 'number'
            ? line.end_time_ms
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

    // 按时间轴排序构建显示顺序：主唱行按 start_time_ms 升序，背景行紧跟父行。
    // TTML 文档中不同 agent 的 <p> 可能交替排列（如 v1 连续三句后跟 v2），
    // 但时间轴上 v2 行可能穿插在 v1 行之间，需要按实际演唱时间排列。
    const sortedIndices: number[] = [];
    const childIndices = new Map<number, number[]>();
    for (let i = 0; i < displayLines.length; i++) {
        const line = displayLines[i];
        if (line.role === 'background') {
            // 找到父行在 displayLines 中的索引
            const parentIdx = line.parent_id != null
                ? displayLines.findIndex((l) => l.id === line.parent_id)
                : -1;
            if (parentIdx >= 0) {
                let children = childIndices.get(parentIdx);
                if (!children) { children = []; childIndices.set(parentIdx, children); }
                children.push(i);
            } else {
                // 无父行的背景行按原始位置插入
                sortedIndices.push(i);
            }
        } else {
            sortedIndices.push(i);
        }
    }
    // 主唱行按 start_time_ms 排序；LRC/SYLT 的无时间说明行沿用旧行为置于最前，
    // 避免元数据行在整首歌播放完后才出现。
    sortedIndices.sort((a, b) => {
        const aStart = displayLines[a].start_time_ms;
        const bStart = displayLines[b].start_time_ms;
        if (aStart === null && bStart === null) return a - b;
        if (aStart === null) return -1;
        if (bStart === null) return 1;
        return aStart - bStart || a - b;
    });
    // 展开：主唱行后紧跟其背景行
    const traversalOrder: number[] = [];
    for (const idx of sortedIndices) {
        traversalOrder.push(idx);
        const children = childIndices.get(idx);
        if (children) traversalOrder.push(...children);
    }

    for (const index of traversalOrder) {
        const line = displayLines[index];
        const isTimelineLine = line.role === 'main';

        if (
            hasTimestamps &&
            typeof line.start_time_ms === 'number' &&
            line.text.length === 0
        ) {
            // 空文本时间标记行（timing-marker）不可渲染，仅维护间隙参考时间
            if (pendingEndMs === null) pendingEndMs = line.start_time_ms;
            continue;
        }

        if (
            hasTimestamps &&
            isTimelineLine &&
            typeof line.start_time_ms === 'number' &&
            lastLyricLineIndex < 0 &&
            line.start_time_ms >= interludeThresholdMs
        ) {
            items.push({
                type: 'interlude',
                afterLineIndex: -1,
                startMs: 0,
                endMs: line.start_time_ms,
            });
        }

        items.push({ type: 'line', line, lineIndex: index });

        if (
            hasTimestamps &&
            isTimelineLine &&
            typeof line.start_time_ms === 'number' &&
            pendingEndMs !== null &&
            lastLyricLineIndex >= 0
        ) {
            const gapMs = line.start_time_ms - pendingEndMs;
            if (gapMs >= interludeThresholdMs) {
                items.splice(items.length - 1, 0, {
                    type: 'interlude',
                    afterLineIndex: lastLyricLineIndex,
                    startMs: pendingEndMs,
                    endMs: line.start_time_ms,
                });
            }
        }

        if (isTimelineLine) {
            pendingEndMs = typeof line.end_time_ms === 'number' ? line.end_time_ms : null;
            if (typeof line.start_time_ms === 'number') lastLyricLineIndex = index;
        }
    }

    return items;
}
