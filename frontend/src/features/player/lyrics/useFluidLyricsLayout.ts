import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState } from 'react';
import { sideLyricsFocusAlpha, topInsetPx } from '@/features/player/lyrics/constants';
import type { DisplayItem } from '@/features/player/lyrics/types';
import { getLyricsDebugSink } from '@/features/player/lyrics/lyricsDebug';
import { getInterludeFocusOffsetPx, getInterludeNeighborShiftPx, getInterludeRowHeightPx } from '@/features/player/lyrics/layoutMetrics';

const DEFAULT_LINE_HEIGHT_PX = 90;
const NARROW_LYRICS_FOCUS_ALPHA = 0.15;
const NARROW_LYRICS_END_STOP_OFFSET = 56;
const OVERSCAN_PX = 300;

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

interface ItemMeasurement {
    height: number;
    width: number;
}

interface MeasurementSnapshot {
    items: DisplayItem[];
    rows: ReadonlyMap<number, ItemMeasurement>;
    flowHeights: ReadonlyMap<number, number>;
    backgroundHeights: Readonly<Record<number, number>>;
    viewport: ItemMeasurement;
    interludeMetrics: ReturnType<typeof readInterludeMetrics>;
}

const readInterludeMetrics = () => ({
    rowHeight: getInterludeRowHeightPx(),
    neighborShift: getInterludeNeighborShiftPx(),
    focusOffset: getInterludeFocusOffsetPx(),
});

const mergeVisibleIndices = (
    current: readonly number[],
    target: readonly number[],
    count: number,
    parents?: ReadonlyMap<number, number>,
) => {
    const visible = new Set(target);
    current.forEach(index => visible.add(index));
    parents?.forEach((parent, child) => {
        if (visible.has(child)) visible.add(parent);
    });
    parents?.forEach((parent, child) => {
        if (visible.has(parent)) visible.add(child);
    });
    return [...visible].filter(index => index >= 0 && index < count).sort((a, b) => a - b);
};

const sameIndices = (left: readonly number[], right: readonly number[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);

/** One observer and one snapshot for viewport, main rows and background rows. */
export function useFluidLyricsMeasurements(displayItems: DisplayItem[]) {
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const nodesRef = useRef(new Map<Element, { index: number; items: DisplayItem[] }>());
    const itemsRef = useRef(displayItems);
    const [snapshot, setSnapshot] = useState<MeasurementSnapshot>(() => ({
        items: displayItems, rows: new Map(), flowHeights: new Map(), backgroundHeights: {}, viewport: { width: 0, height: 0 },
        interludeMetrics: readInterludeMetrics(),
    }));
    // Deduplicate deliveries even before React commits the previous batch.
    const snapshotRef = useRef(snapshot);
    useInsertionEffect(() => {
        itemsRef.current = displayItems;
        if (snapshotRef.current.items !== displayItems) {
            snapshotRef.current = {
                ...snapshotRef.current, items: displayItems, rows: new Map(),
                flowHeights: new Map(), backgroundHeights: {},
            };
        }
    }, [displayItems]);

    const observeItem = useCallback((index: number, node: HTMLDivElement) => {
        const item = displayItems[index];
        // Preserve the previous background measurement box (the button, not
        // the shell's inline formatting box), without its own observer/read.
        const measuredNode = item?.type === 'line' && item.line.role === 'background'
            ? node.querySelector<HTMLElement>('.lyrics-motion-row') ?? node : node;
        nodesRef.current.set(measuredNode, { index, items: displayItems });
        observerRef.current?.observe(measuredNode, { box: 'border-box' });
        return () => {
            observerRef.current?.unobserve(measuredNode);
            nodesRef.current.delete(measuredNode);
        };
    }, [displayItems]);

    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            const previous = snapshotRef.current;
            let viewport = previous.viewport;
            let changedRows: Map<number, ItemMeasurement> | undefined;
            let flowHeights: Map<number, number> | undefined;
            let backgroundHeights: Record<number, number> | undefined;
            let changedCount = 0;
            entries.forEach(entry => {
                if (entry.target === scrollAreaRef.current) {
                    const { width, height } = entry.contentRect;
                    if (width !== viewport.width || height !== viewport.height) viewport = { width, height };
                    return;
                }
                const registration = nodesRef.current.get(entry.target);
                if (!registration || registration.items !== itemsRef.current) return;
                const { index } = registration;
                const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
                const width = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width;
                if (width <= 0 || height <= 0) return;
                const oldSize = (changedRows ?? previous.rows).get(index);
                // Fonts and wrapping can change height without changing width.
                if (oldSize && Math.abs(oldSize.height - height) < 0.5 && Math.abs(oldSize.width - width) < 0.5) return;
                changedRows ??= new Map(previous.rows);
                changedRows.set(index, { height, width });
                const item = registration.items[index];
                if (item?.type === 'line' && item.line.role === 'background') {
                    if (previous.backgroundHeights[index] !== height) {
                        backgroundHeights ??= { ...previous.backgroundHeights };
                        backgroundHeights[index] = height;
                    }
                } else if (previous.flowHeights.get(index) !== height) {
                    flowHeights ??= new Map(previous.flowHeights);
                    flowHeights.set(index, height);
                }
                changedCount++;
            });
            if (!changedRows && viewport === previous.viewport) return;
            // Root-font/viewport-derived metrics are read after a size delivery,
            // never at each playback boundary. Preserve identity if unchanged.
            const metrics = readInterludeMetrics();
            const oldMetrics = previous.interludeMetrics;
            const interludeMetrics = metrics.rowHeight === oldMetrics.rowHeight &&
                metrics.neighborShift === oldMetrics.neighborShift && metrics.focusOffset === oldMetrics.focusOffset
                ? oldMetrics : metrics;
            const next = {
                items: itemsRef.current, rows: changedRows ?? previous.rows, viewport,
                flowHeights: flowHeights ?? previous.flowHeights,
                backgroundHeights: backgroundHeights ?? previous.backgroundHeights,
                interludeMetrics,
            };
            snapshotRef.current = next;
            getLyricsDebugSink()?.({ type: 'measurement-batch', entries: entries.length });
            getLyricsDebugSink()?.({ type: 'measurement-change', changed: changedCount });
            setSnapshot(next);
        });
        observerRef.current = observer;
        nodesRef.current.forEach((_registration, node) => observer.observe(node, { box: 'border-box' }));
        const viewport = scrollAreaRef.current;
        if (viewport) observer.observe(viewport);
        return () => {
            observer.disconnect();
            if (observerRef.current === observer) observerRef.current = null;
        };
    }, []);

    const backgroundHeights = useMemo(() => snapshot.items === displayItems
        ? snapshot.backgroundHeights : {}, [displayItems, snapshot.items, snapshot.backgroundHeights]);

    return { snapshot, backgroundHeights, observeItem, scrollAreaRef };
}

interface FluidLyricsLayoutArgs {
    activeDisplayIndex: number;
    activeFocusOffset: number;
    displayItems: DisplayItem[];
    /** When true, the active follow target is the effective fallback window. */
    includeActiveWindow: boolean;
    interludeRowHeight: number;
    variant: 'side' | 'narrow';
    visualShifts: number[];
    measurements: MeasurementSnapshot;
    parentDisplayIndexMap?: ReadonlyMap<number, number>;
}

/** Derive geometry and the target window from the same measurement batch. */
export function useFluidLyricsLayout({
    activeDisplayIndex,
    activeFocusOffset,
    displayItems,
    includeActiveWindow,
    interludeRowHeight,
    variant,
    visualShifts,
    measurements,
    parentDisplayIndexMap,
}: FluidLyricsLayoutArgs) {
    const viewportSize = measurements.viewport;
    const maxScrollYRef = useRef(0);
    const targetScrollYRef = useRef(0);
    const [targetScrollY, setTargetScrollYState] = useState(0);
    const [springWindow, setSpringWindow] = useState<{ items: DisplayItem[]; indices: readonly number[] }>({
        items: displayItems, indices: [],
    });
    const springWindowRef = useRef(springWindow);
    const displayItemsRef = useRef(displayItems);
    useInsertionEffect(() => {
        displayItemsRef.current = displayItems;
    }, [displayItems]);

    const focusAlpha = variant === 'narrow' ? NARROW_LYRICS_FOCUS_ALPHA : sideLyricsFocusAlpha;
    const topSpacerHeight = viewportSize.height * focusAlpha;
    const bottomSpacerHeight = variant === 'narrow'
        ? Math.max(0, viewportSize.height * (1 - focusAlpha) - NARROW_LYRICS_END_STOP_OFFSET)
        : viewportSize.height * (1 - focusAlpha);

    const layout = useMemo(() => {
        const measuredHeights = measurements.items === displayItems ? measurements.flowHeights : undefined;
        const itemTops = new Array<number>(displayItems.length);
        const itemHeights = new Array<number>(displayItems.length);
        let cursor = topSpacerHeight + topInsetPx;
        displayItems.forEach((item, index) => {
            const isBackground = item.type === 'line' && item.line.role === 'background';
            // Cache the real background height, but expand via visualShifts.
            const height = isBackground ? 0 : measuredHeights?.get(index) ??
                (item.type === 'interlude' ? interludeRowHeight : DEFAULT_LINE_HEIGHT_PX);
            itemTops[index] = cursor;
            itemHeights[index] = height;
            cursor += height;
        });
        return { contentHeight: cursor + bottomSpacerHeight, itemHeights, itemTops };
    }, [bottomSpacerHeight, displayItems, interludeRowHeight, measurements.items, measurements.flowHeights, topSpacerHeight]);

    const maxScrollY = Math.max(0, layout.contentHeight - viewportSize.height);
    const activeTargetScrollY = useMemo(() => {
        if (activeDisplayIndex < 0 || viewportSize.height <= 0) return 0;
        const itemTop = layout.itemTops[activeDisplayIndex] ?? 0;
        const itemHeight = layout.itemHeights[activeDisplayIndex] ?? DEFAULT_LINE_HEIGHT_PX;
        const visualShift = visualShifts[activeDisplayIndex] ?? 0;
        return clamp(
            Math.round(itemTop + itemHeight / 2 + visualShift + activeFocusOffset - viewportSize.height * focusAlpha),
            0, maxScrollY,
        );
    }, [activeDisplayIndex, activeFocusOffset, focusAlpha, layout.itemHeights, layout.itemTops, maxScrollY, viewportSize.height, visualShifts]);

    const setTargetScrollY = useCallback((value: number) => {
        const nextTarget = clamp(value, 0, maxScrollYRef.current);
        targetScrollYRef.current = nextTarget;
        setTargetScrollYState(nextTarget);
        return nextTarget;
    }, []);

    const fallbackVisibleIndices = useMemo(() => {
        if (viewportSize.width <= 0 || viewportSize.height <= 0) return [];
        const windowTop = includeActiveWindow ? activeTargetScrollY : clamp(targetScrollY, 0, maxScrollY);
        const minimum = windowTop - OVERSCAN_PX;
        const maximum = windowTop + viewportSize.height + OVERSCAN_PX;
        const visible: number[] = [];
        // Group shifts need not be monotonic. This also includes a tall wrapped
        // row crossing the upper edge, which lowerBound(top) - 1 can miss.
        layout.itemTops.forEach((top, index) => {
            const visualTop = top + (visualShifts[index] ?? 0);
            if (visualTop + layout.itemHeights[index] >= minimum && visualTop <= maximum) visible.push(index);
        });
        return visible;
    }, [activeTargetScrollY, includeActiveWindow, layout.itemHeights, layout.itemTops, maxScrollY, targetScrollY, viewportSize.height, viewportSize.width, visualShifts]);

    const targetWindowRef = useRef({ indices: fallbackVisibleIndices, parents: parentDisplayIndexMap });
    useInsertionEffect(() => {
        targetWindowRef.current = { indices: fallbackVisibleIndices, parents: parentDisplayIndexMap };
    }, [fallbackVisibleIndices, parentDisplayIndexMap]);

    const updateSpringVisibleIndices = useCallback((indices: readonly number[]) => {
        const previous = springWindowRef.current;
        const items = displayItemsRef.current;
        if (previous.items === items) {
            if (sameIndices(previous.indices, indices)) return;
            const target = targetWindowRef.current;
            // Movement entirely within the already mounted target/group set
            // needs no React commit. The animator republishes the current
            // snapshot when the target changes, even if its springs did not.
            if (sameIndices(
                mergeVisibleIndices(previous.indices, target.indices, items.length, target.parents),
                mergeVisibleIndices(indices, target.indices, items.length, target.parents),
            )) return;
        }
        const next = { items, indices: [...indices] };
        springWindowRef.current = next;
        setSpringWindow(next);
    }, []);

    const visibleIndices = useMemo(() => {
        if (viewportSize.width <= 0 || viewportSize.height <= 0) return [];
        // Complete only groups intersecting either window, not remote active rows.
        return mergeVisibleIndices(
            springWindow.items === displayItems ? springWindow.indices : [],
            fallbackVisibleIndices, displayItems.length, parentDisplayIndexMap,
        );
    }, [displayItems, fallbackVisibleIndices, parentDisplayIndexMap, springWindow, viewportSize.height, viewportSize.width]);

    useInsertionEffect(() => {
        maxScrollYRef.current = maxScrollY;
    }, [maxScrollY]);
    useEffect(() => {
        if (targetScrollYRef.current > maxScrollY) setTargetScrollY(maxScrollY);
    }, [maxScrollY, setTargetScrollY]);

    return {
        activeTargetScrollY,
        contentHeight: layout.contentHeight,
        fallbackVisibleIndices,
        itemHeights: layout.itemHeights,
        itemTops: layout.itemTops,
        setTargetScrollY,
        targetScrollY: clamp(targetScrollY, 0, maxScrollY),
        topSpacerHeight,
        visibleIndices,
        updateSpringVisibleIndices,
        viewportHeight: viewportSize.height,
    };
}
