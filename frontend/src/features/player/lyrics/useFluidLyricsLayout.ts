import { useCallback, useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sideLyricsFocusAlpha, topInsetPx } from '@/features/player/lyrics/constants';
import type { DisplayItem } from '@/features/player/lyrics/types';

const DEFAULT_LINE_HEIGHT_PX = 90;
const NARROW_LYRICS_FOCUS_ALPHA = 0.15;
const NARROW_LYRICS_END_STOP_OFFSET = 56;
const OVERSCAN_PX = 300;

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

interface FluidLyricsLayoutArgs {
    activeDisplayIndex: number;
    activeFocusOffset: number;
    displayItems: DisplayItem[];
    includeActiveWindow: boolean;
    interludeRowHeight: number;
    variant: 'side' | 'narrow';
    visualShifts: number[];
}

interface ViewportSize {
    width: number;
    height: number;
}

interface ItemMeasurement {
    height: number;
    width: number;
}

/**
 * 为动画优先歌词维护轻量布局模型，只挂载视口与过渡窗口内的昂贵行内容。
 */
export function useFluidLyricsLayout({
    activeDisplayIndex,
    activeFocusOffset,
    displayItems,
    includeActiveWindow,
    interludeRowHeight,
    variant,
    visualShifts,
}: FluidLyricsLayoutArgs) {
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const itemObserverRef = useRef<ResizeObserver | null>(null);
    const nodeIndexesRef = useRef(new WeakMap<Element, number>());
    const observedNodesRef = useRef(new Set<HTMLDivElement>());
    const maxScrollYRef = useRef(0);
    const targetScrollYRef = useRef(0);
    const heightCacheRef = useRef<{
        items: DisplayItem[];
        measurements: Map<number, ItemMeasurement>;
    }>({ items: displayItems, measurements: new Map() });
    const [measurements, setMeasurements] = useState<{
        items: DisplayItem[];
        measurements: Map<number, ItemMeasurement>;
    }>({ items: displayItems, measurements: new Map() });
    const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
    const [targetScrollY, setTargetScrollYState] = useState(0);
    const [visibleIndices, setVisibleIndices] = useState<readonly number[]>([]);
    const visibleIndicesRef = useRef<readonly number[]>([]);
    const [visibleIndicesItems, setVisibleIndicesItems] = useState(displayItems);
    const displayItemsRef = useRef(displayItems);

    useInsertionEffect(() => {
        displayItemsRef.current = displayItems;
        if (visibleIndicesItems === displayItems) return;
        // Do not let a previous document's numeric indices render against a
        // new document for one commit. The animator publishes the new spatial
        // set after its models are synchronized.
        visibleIndicesRef.current = [];
    }, [displayItems, visibleIndicesItems]);

    const focusAlpha = variant === 'narrow' ? NARROW_LYRICS_FOCUS_ALPHA : sideLyricsFocusAlpha;
    const topSpacerHeight = viewportSize.height * focusAlpha;
    const bottomSpacerHeight = variant === 'narrow'
        ? Math.max(0, viewportSize.height * (1 - focusAlpha) - NARROW_LYRICS_END_STOP_OFFSET)
        : viewportSize.height * (1 - focusAlpha);

    const layout = useMemo(() => {
        const measuredItems = measurements.items === displayItems
            ? measurements.measurements
            : new Map<number, ItemMeasurement>();
        const itemTops = new Array<number>(displayItems.length);
        const itemHeights = new Array<number>(displayItems.length);
        let cursor = topSpacerHeight + topInsetPx;

        displayItems.forEach((item, index) => {
            const estimatedHeight = item.type === 'interlude'
                ? interludeRowHeight
                : item.type === 'line' && item.line.role === 'background'
                    ? 0
                    : DEFAULT_LINE_HEIGHT_PX;
            const height = measuredItems.get(index)?.height ?? estimatedHeight;
            itemTops[index] = cursor;
            itemHeights[index] = height;
            cursor += height;
        });

        return {
            contentHeight: cursor + bottomSpacerHeight,
            itemHeights,
            itemTops,
        };
    }, [bottomSpacerHeight, displayItems, interludeRowHeight, measurements, topSpacerHeight]);

    const maxScrollY = Math.max(0, layout.contentHeight - viewportSize.height);
    const activeTargetScrollY = useMemo(() => {
        if (activeDisplayIndex < 0 || viewportSize.height <= 0) return 0;
        const itemTop = layout.itemTops[activeDisplayIndex] ?? 0;
        const itemHeight = layout.itemHeights[activeDisplayIndex] ?? DEFAULT_LINE_HEIGHT_PX;
        const visualShift = visualShifts[activeDisplayIndex] ?? 0;
        return clamp(
            Math.round(itemTop + itemHeight / 2 + visualShift + activeFocusOffset - viewportSize.height * focusAlpha),
            0,
            maxScrollY
        );
    }, [activeDisplayIndex, activeFocusOffset, focusAlpha, layout.itemHeights, layout.itemTops, maxScrollY, viewportSize.height, visualShifts]);

    const setTargetScrollY = useCallback((value: number) => {
        const nextTarget = clamp(value, 0, maxScrollYRef.current);
        targetScrollYRef.current = nextTarget;
        setTargetScrollYState(nextTarget);
        return nextTarget;
    }, []);

    const fallbackVisibleIndices = useMemo(() => {
        const windows = [targetScrollY];
        if (includeActiveWindow) windows.push(activeTargetScrollY);

        const visualTops = layout.itemTops.map((top, index) => top + (visualShifts[index] ?? 0));
        const visible = new Set<number>();
        const lowerBound = (value: number) => {
            let low = 0;
            let high = visualTops.length;
            while (low < high) {
                const middle = (low + high) >> 1;
                if (visualTops[middle] < value) low = middle + 1;
                else high = middle;
            }
            return low;
        };

        windows.forEach(windowTop => {
            const minimum = windowTop - OVERSCAN_PX;
            const maximum = windowTop + viewportSize.height + OVERSCAN_PX;
            const firstIndex = Math.max(0, lowerBound(minimum) - 1);
            const endIndex = Math.min(displayItems.length, lowerBound(maximum) + 1);
            for (let index = firstIndex; index < endIndex; index++) {
                const visualBottom = visualTops[index] + layout.itemHeights[index];
                if (visualBottom >= minimum && visualTops[index] <= maximum) visible.add(index);
            }
        });
        return [...visible].sort((left, right) => left - right);
    }, [activeTargetScrollY, displayItems, includeActiveWindow, layout.itemHeights, layout.itemTops, targetScrollY, viewportSize.height, visualShifts]);

    const fallbackVisibleIndicesRef = useRef<readonly number[]>(fallbackVisibleIndices);
    useInsertionEffect(() => {
        fallbackVisibleIndicesRef.current = fallbackVisibleIndices;
    }, [fallbackVisibleIndices]);

    const updateVisibleIndices = useCallback((indices: readonly number[]) => {
        const previous = visibleIndicesRef.current;
        if (
            previous.length === indices.length &&
            previous.every((value, index) => value === indices[index])
        ) return;
        const next = [...indices];
        visibleIndicesRef.current = next;
        setVisibleIndicesItems(displayItemsRef.current);
        setVisibleIndices(next);
    }, []);

    // A new document or viewport starts with a target-based set so the first
    // frame has content. The animator replaces it with the spring-position
    // based spatial set as soon as its model is ready.
    useLayoutEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            // The animator may already have published a spring-based set in
            // this commit. Do not replace it with the target-window fallback.
            if (visibleIndicesRef.current.length > 0) return;
            if (viewportSize.width <= 0 || viewportSize.height <= 0) {
                updateVisibleIndices([]);
                return;
            }
            updateVisibleIndices(fallbackVisibleIndicesRef.current);
        });
        return () => {
            cancelled = true;
        };
    }, [displayItems, updateVisibleIndices, viewportSize.height, viewportSize.width]);

    const measureItems = useCallback((updates: ReadonlyMap<number, ItemMeasurement>) => {
        if (updates.size === 0) return;
        // 背景行在布局模型中恒为 0 高度（间奏式折叠，不占位），
        // 激活时的撑开由面板的 visualShifts 处理，因此忽略其测量。
        const filteredUpdates = new Map<number, ItemMeasurement>();
        updates.forEach((measurement, index) => {
            const item = displayItems[index];
            if (item?.type === 'line' && item.line.role === 'background') return;
            if (measurement.height > 0 && measurement.width > 0) {
                filteredUpdates.set(index, measurement);
            }
        });
        if (filteredUpdates.size === 0) return;
        const cache = heightCacheRef.current.items === displayItems
            ? heightCacheRef.current
            : { items: displayItems, measurements: new Map<number, ItemMeasurement>() };
        heightCacheRef.current = cache;
        filteredUpdates.forEach((measurement, index) => {
            const cached = cache.measurements.get(index);
            // A same-width ResizeObserver callback can be caused by content
            // visibility/paint changes. Keep the trusted height until the
            // actual layout width changes; otherwise later rows would move
            // during a frame and restart their springs.
            if (!cached || Math.abs(cached.width - measurement.width) >= 0.5) {
                cache.measurements.set(index, measurement);
            }
        });
        setMeasurements(previous => {
            const previousMeasurements = previous.items === displayItems
                ? previous.measurements
                : new Map<number, ItemMeasurement>();
            const nextMeasurements = new Map(previousMeasurements);
            let changed = previous.items !== displayItems;
            filteredUpdates.forEach((measurement, index) => {
                const previousMeasurement = nextMeasurements.get(index);
                if (
                    previousMeasurement &&
                    Math.abs(previousMeasurement.width - measurement.width) < 0.5
                ) return;
                nextMeasurements.set(index, measurement);
                changed = true;
            });
            if (!changed) return previous;
            return { items: displayItems, measurements: nextMeasurements };
        });
    }, [displayItems]);

    const observeItem = useCallback((index: number, node: HTMLDivElement) => {
        nodeIndexesRef.current.set(node, index);
        observedNodesRef.current.add(node);
        itemObserverRef.current?.observe(node);

        return () => {
            itemObserverRef.current?.unobserve(node);
            observedNodesRef.current.delete(node);
            // 虚拟化只卸载 DOM；heights 中的真实测量保留给轻量 row model 复用。
        };
    }, []);

    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            const updates = new Map<number, ItemMeasurement>();
            entries.forEach(entry => {
                const index = nodeIndexesRef.current.get(entry.target);
                const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
                const width = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width;
                if (index !== undefined) updates.set(index, { height, width });
            });
            measureItems(updates);
        });
        itemObserverRef.current = observer;
        observedNodesRef.current.forEach(node => observer.observe(node));
        return () => {
            observer.disconnect();
            if (itemObserverRef.current === observer) itemObserverRef.current = null;
        };
    }, [measureItems]);

    useEffect(() => {
        const element = scrollAreaRef.current;
        if (!element) return;

        const update = () => {
            const nextSize = { width: element.clientWidth, height: element.clientHeight };
            // 保留上一帧的真实尺寸，避免宽度变化时所有行短暂退回统一估算
            // 高度而发生重叠。布局提交后由下面的 layout effect 一次性重测。
            setViewportSize(previous =>
                previous.width === nextSize.width && previous.height === nextSize.height
                    ? previous
                    : nextSize
            );
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useLayoutEffect(() => {
        if (viewportSize.width <= 0) return;
        const updates = new Map<number, ItemMeasurement>();
        observedNodesRef.current.forEach(node => {
            const index = nodeIndexesRef.current.get(node);
            if (index === undefined) return;
            const rect = node.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                updates.set(index, { height: rect.height, width: rect.width });
            }
        });
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) measureItems(updates);
        });
        return () => {
            cancelled = true;
        };
    }, [measureItems, viewportSize.width]);

    useEffect(() => {
        maxScrollYRef.current = maxScrollY;
        if (targetScrollYRef.current <= maxScrollY) return;
        setTargetScrollY(maxScrollY);
    }, [maxScrollY, setTargetScrollY]);

    const cachedItemHeights = useMemo(() => displayItems.map((_item, index) => {
        const measurement = measurements.items === displayItems
            ? measurements.measurements.get(index)
            : undefined;
        return measurement && Math.abs(measurement.width - viewportSize.width) < 0.5
            ? measurement.height
            : null;
    }), [displayItems, measurements, viewportSize.width]);

    return {
        activeTargetScrollY,
        cachedItemHeights,
        contentHeight: layout.contentHeight,
        fallbackVisibleIndices,
        itemHeights: layout.itemHeights,
        itemTops: layout.itemTops,
        observeItem,
        scrollAreaRef,
        setTargetScrollY,
        targetScrollY,
        topSpacerHeight,
        visibleIndices: visibleIndicesItems === displayItems
            ? visibleIndices
            : [],
        updateVisibleIndices,
        viewportHeight: viewportSize.height,
    };
}
