import { describe, expect, it } from 'vitest';
import type { LyricsLine } from '@/types';
import { createAnimatedLyricsTimeline } from '@/features/player/lyrics/animatedLyricsTimeline';
import { buildDisplayItems, buildAnimatedLyricsRenderBoundaries, getActiveLyricsState } from '@/features/player/lyrics/lyricsDisplay';
import { animationLyricsTimingStrategy as strategy } from '@/features/player/lyrics/timingStrategy';
import { interludeGapOpenDurationMs, interludeNextLineFocusLeadMs } from '@/features/player/lyrics/constants';

const line = (id: string, start: number, end: number, extra: Partial<LyricsLine> = {}): LyricsLine => ({
    id, role: 'main', text: id, words: [], start_time_ms: start, end_time_ms: end, ...extra,
});

describe('semantic animated lyrics timeline', () => {
    it.each([false, true])('preserves current focus, harmonies and tails in either seek direction (TTML=%s)', isTtml => {
        const lines = [
            line('主行', 1200, 3200, { words: [{ text: '雨 Rain', start_time_ms: 1200, end_time_ms: 3000 }], visual_end_ms: 2600 }),
            line('和声1', 1900, 4000, { role: 'background', parent_id: '主行' }),
            line('和声2', 2300, 4100, { role: 'background', parent_id: '主行' }),
            line('next', 3600, 5500), line('interlude', 14000, 16500),
        ];
        const items = buildDisplayItems(lines, true, strategy);
        const timeline = createAnimatedLyricsTimeline(items, lines, strategy, isTtml);
        const boundaries = buildAnimatedLyricsRenderBoundaries(items, lines, strategy, isTtml);
        const times = [...new Set([0, ...boundaries.flatMap(time => [Math.max(0, time - 0.1), time, time + 0.1])])].sort((a, b) => a - b);
        for (const time of [...times, ...times.toReversed(), 2800, 800, 16000, 2800]) {
            const actual = timeline.getSnapshot(time);
            const expected = getActiveLyricsState(items, lines, time / 1000, strategy, isTtml);
            expect(actual.focusIndex, `time=${time}`).toBe(expected.focusIndex);
            expect(actual.activeIndices, `time=${time}`).toEqual(expected.activeIndices);
            const expectedKaraoke = new Set(expected.activeIndices);
            items.forEach((item, index) => {
                if (item.type === 'line' && item.line.words.length && strategy.focusNextLineByVisualEnd &&
                    typeof item.line.visual_end_ms === 'number' && typeof item.line.end_time_ms === 'number' &&
                    item.line.visual_end_ms < item.line.end_time_ms && time >= item.line.visual_end_ms &&
                    time < item.line.end_time_ms) expectedKaraoke.add(index);
            });
            expect(actual.karaokeActiveIndices).toEqual(expectedKaraoke);
        }
    });

    it('skips redundant boundaries while retaining collection identity', () => {
        const lines = [line('a', 0, 1000), line('b', 2000, 4000)];
        const items = buildDisplayItems(lines, true, strategy);
        const timeline = createAnimatedLyricsTimeline(items, lines, strategy, false);
        const before = timeline.getSnapshot(999);
        const after = timeline.getSnapshot(1000);
        expect(after.key).toBe(before.key);
        expect(after.activeIndices).toBe(before.activeIndices);
        expect(timeline.getSnapshot(1100)).toBe(after);
    });

    it('does not coalesce interlude open/ready/exit boundaries', () => {
        const lines = [line('a', 10000, 12000)];
        const items = buildDisplayItems(lines, true, strategy);
        const timeline = createAnimatedLyricsTimeline(items, lines, strategy, false);
        for (const item of items) {
            if (item.type !== 'interlude') continue;
            for (const time of [item.startMs, item.startMs + interludeGapOpenDurationMs, item.endMs - interludeNextLineFocusLeadMs, item.endMs]) {
                expect(timeline.getRenderKey(time)).not.toBe(timeline.getRenderKey(time - 0.1));
            }
        }
    });

    it('isolates documents and remains deterministic after cache eviction', () => {
        const lines = [line('a', 0, 1000), line('b', 2000, 3000), line('c', 4000, 5000)];
        const items = buildDisplayItems(lines, true, strategy);
        const timeline = createAnimatedLyricsTimeline(items, lines, strategy, false);
        const key = timeline.getRenderKey(500);
        timeline.getRenderKey(2500);
        timeline.getRenderKey(4500);
        expect(timeline.getRenderKey(500)).toBe(key);
        const other = createAnimatedLyricsTimeline([], [], strategy, false);
        expect(other.getSnapshot(500).activeIndices.size).toBe(0);
    });

    it('refreshes exact state for hard seeks inside a cached render interval', () => {
        const lines = [line('a', 0, 1600), line('b', 2000, 4000)];
        const items = buildDisplayItems(lines, true, strategy);
        const timeline = createAnimatedLyricsTimeline(items, lines, strategy, false);
        timeline.getSnapshot(1000);
        timeline.getRenderKey(1599, true);
        expect(timeline.getSnapshot(1599).activeIndices).toEqual(
            getActiveLyricsState(items, lines, 1.599, strategy, false).activeIndices,
        );
        timeline.getRenderKey(1000, true);
        expect(timeline.getSnapshot(1000).activeIndices).toEqual(
            getActiveLyricsState(items, lines, 1, strategy, false).activeIndices,
        );
    });
});
