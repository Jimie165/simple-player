import type { LyricsWord } from '@/types';
import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';

type IndexedCharItem = { item: FlatCharItem; flatIndex: number };

export type LineFillCharRuntime = {
    longToneAmount: number;
    fillLeftPx: number;
    fillWidthPx: number;
    fillMaskWidthPx: number;
    fillPaddingPx: number;
    fillFeatherPx: number;
};

type WordFillPlan = {
    startMs: number;
    durationMs: number;
    startPx: number;
    endPx: number;
    featherPx: number;
    bridgeFromPrevious: boolean;
    bridgeToNext: boolean;
    chainIndex: number;
    voiced: IndexedCharItem[];
};

type FillTimelineSegment = {
    startMs: number;
    endMs: number;
    startPx: number;
    endPx: number;
};

export function createLineFill(
    wordGroups: IndexedCharItem[][],
    charElements: Array<HTMLSpanElement | null>,
    charRuntimes: Array<LineFillCharRuntime | undefined>,
    words: LyricsWord[],
    lineEndMs: number | null,
    wordFill = false,
) {
    let lineWidth = 0;
    const plans: Array<WordFillPlan | null> = wordGroups.map((group, wordIndex) => {
        const voiced = group.filter(({ item }) => !/^\s+$/.test(item.char));
        const firstElement = charElements[group[0].flatIndex];
        if (!firstElement) return null;
        const fontSize = parseFloat(getComputedStyle(firstElement).fontSize);
        if (!Number.isFinite(fontSize) || fontSize <= 0) return null;
        let width = 0;
        group.forEach(({ flatIndex }) => {
            const element = charElements[flatIndex];
            const runtime = charRuntimes[flatIndex];
            if (!element || !runtime) return;
            const maskWidth = element.offsetWidth;
            if (maskWidth <= 0) return;
            const padding = fontSize * 0.1;
            const advance = Math.max(1, maskWidth - padding * 2);
            runtime.fillLeftPx = lineWidth + width;
            runtime.fillWidthPx = advance;
            runtime.fillMaskWidthPx = maskWidth;
            runtime.fillPaddingPx = padding;
            const featherPx = fontSize * (0.16 + runtime.longToneAmount * 0.1);
            runtime.fillFeatherPx = featherPx;
            element.style.setProperty('--kfe', String(featherPx / maskWidth * 100));
            width += advance;
        });
        lineWidth += width;
        if (voiced.length === 0) return null;
        const first = voiced[0];
        const last = voiced[voiced.length - 1];
        const firstRuntime = charRuntimes[first.flatIndex];
        const lastRuntime = charRuntimes[last.flatIndex];
        const word = words[wordIndex];
        if (!firstRuntime?.fillWidthPx || !lastRuntime?.fillWidthPx || !word) return null;
        const parsedEndMs = word.end_time_ms !== undefined
            ? word.end_time_ms
            : wordIndex + 1 < words.length
                ? words[wordIndex + 1].start_time_ms
                : lineEndMs ?? word.start_time_ms + 600;
        const nextWordStartMs = words[wordIndex + 1]?.start_time_ms;
        const fillEndMs = nextWordStartMs !== undefined && nextWordStartMs >= word.start_time_ms
            ? Math.min(parsedEndMs, nextWordStartMs)
            : parsedEndMs;
        const sourceDurationMs = Math.max(1, fillEndMs - word.start_time_ms);
        const parsedSourceDurationMs = Math.max(1, parsedEndMs - word.start_time_ms);
        const parsedDurationMs = wordIndex === words.length - 1 && word.end_time_ms === undefined
            ? Math.min(800, Math.max(80, parsedSourceDurationMs))
            : Math.max(80, parsedSourceDurationMs);
        const compressedSpanMs = Math.max(1, last.item.nextStart - first.item.time_ms);
        return {
            startMs: first.item.time_ms,
            durationMs: Math.max(1,
                Math.min(sourceDurationMs, parsedDurationMs) * compressedSpanMs / parsedDurationMs),
            startPx: firstRuntime.fillLeftPx,
            endPx: lastRuntime.fillLeftPx + lastRuntime.fillWidthPx,
            featherPx: firstRuntime.fillFeatherPx,
            bridgeFromPrevious: false,
            bridgeToNext: false,
            chainIndex: -1,
            voiced,
        };
    });
    for (let index = 0; index < plans.length - 1; index++) {
        const current = plans[index];
        const next = plans[index + 1];
        if (!current || !next) continue;
        const gapMs = next.startMs - current.startMs - current.durationMs;
        if (gapMs >= 0 && gapMs <= 1) {
            current.bridgeToNext = true;
            next.bridgeFromPrevious = true;
        }
    }
    let chainIndex = -1;
    let previousPlan: WordFillPlan | null = null;
    const timeline: FillTimelineSegment[] = [];
    plans.forEach(plan => {
        if (!plan) return;
        if (!plan.bridgeFromPrevious) chainIndex++;
        plan.chainIndex = chainIndex;
        const segments = wordFill ? [plan.voiced[0]] : plan.voiced;
        const segmentDurationMs = plan.durationMs / segments.length;
        segments.forEach(({ flatIndex }, index) => {
            const runtime = charRuntimes[flatIndex];
            if (!runtime) return;
            const startPx = index === 0
                ? previousPlan
                    ? previousPlan.endPx + (previousPlan.bridgeToNext ? 0 : previousPlan.featherPx)
                    : plan.startPx - plan.featherPx
                : runtime.fillLeftPx;
            const endPx = (wordFill ? plan.endPx : runtime.fillLeftPx + runtime.fillWidthPx) +
                (index === segments.length - 1 && !plan.bridgeToNext ? plan.featherPx : 0);
            timeline.push({
                startMs: plan.startMs + index * segmentDurationMs,
                endMs: plan.startMs + (index + 1) * segmentDurationMs,
                startPx,
                endPx,
            });
        });
        previousPlan = plan;
    });

    let currentWordIndex = -1;
    let currentHeadPx = timeline[0]?.startPx ?? 0;
    return {
        update(timeMs: number) {
            currentWordIndex = -1;
            plans.forEach((plan, wordIndex) => {
                if (plan && timeMs >= plan.startMs) currentWordIndex = wordIndex;
            });
            currentHeadPx = timeline[0]?.startPx ?? 0;
            for (const segment of timeline) {
                if (timeMs < segment.startMs) break;
                const progress = Math.min(1, Math.max(0,
                    (timeMs - segment.startMs) / (segment.endMs - segment.startMs)));
                currentHeadPx = segment.startPx + (segment.endPx - segment.startPx) * progress;
            }
        },
        getWordFillStop(wordIndex: number): number | null {
            const group = wordGroups[wordIndex];
            if (!group?.length) return null;
            const first = charRuntimes[group[0].flatIndex];
            const last = charRuntimes[group[group.length - 1].flatIndex];
            if (!first || !last) return null;
            const width = last.fillLeftPx + last.fillWidthPx - first.fillLeftPx;
            return this.getFillStop(wordIndex, {
                ...first,
                fillPaddingPx: 0,
                fillMaskWidthPx: Math.max(1, width),
            });
        },
        getFillStop(wordIndex: number, runtime: LineFillCharRuntime): number | null {
            const plan = plans[wordIndex];
            if (!plan) return null;
            const currentPlan = plans[currentWordIndex];
            const headPx = currentPlan && plan.chainIndex === currentPlan.chainIndex
                ? currentHeadPx
                : wordIndex < currentWordIndex
                    ? plan.endPx + plan.featherPx
                    : plan.startPx - plan.featherPx - 1;
            return (headPx - runtime.fillLeftPx + runtime.fillPaddingPx) / runtime.fillMaskWidthPx * 100;
        },
    };
}
