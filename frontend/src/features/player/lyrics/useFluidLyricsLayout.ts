import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sideLyricsFocusAlpha, topInsetPx } from '@/features/player/lyrics/constants';
import type { DisplayItem } from '@/features/player/lyrics/types';
import type { LyricsVisibilityStore } from '@/features/player/lyrics/lyricsVisibilityStore';

const DEFAULT_LINE_HEIGHT_PX = 90;
const NARROW_LYRICS_FOCUS_ALPHA = 0.15;
const NARROW_LYRICS_END_STOP_OFFSET = 56;

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

interface FluidLyricsLayoutArgs {
    activeDisplayIndex: number;
    activeFocusOffset: number;
    displayItems: DisplayItem[];
    interludeRowHeight: number;
    variant: 'side' | 'narrow';
    visualShifts: number[];
    visibilityStore: LyricsVisibilityStore;
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
    interludeRowHeight,
    variant,
    visualShifts,
    visibilityStore,
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
    const spatialVisibilityRef = useRef<{
        items: DisplayItem[];
        indices: readonly number[];
    } | null>(null);
    const initialVisibilityItemsRef = useRef<DisplayItem[] | null>(null);

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

    const updateVisibleIndices = useCallback((indices: readonly number[]) => {
        const previous = spatialVisibilityRef.current;
        if (
            previous?.items === displayItems &&
            previous.indices.length === indices.length &&
            previous.indices.every((value, index) => value === indices[index])
        ) return;
        spatialVisibilityRef.current = { items: displayItems, indices: [...indices] };
        visibilityStore.set(displayItems, indices);
    }, [displayItems, visibilityStore]);

    const initialVisibleIndices = useMemo(() => {
        if (viewportSize.height <= 0) return [];
        const minimum = -300;
        const maximum = viewportSize.height + 300;
        const initialVisible: number[] = [];
        layout.itemTops.forEach((itemTop, index) => {
            const top = itemTop + (visualShifts[index] ?? 0) - targetScrollY;
            if (top + layout.itemHeights[index] >= minimum && top <= maximum) {
                initialVisible.push(index);
            }
        });
        return initialVisible;
    }, [layout.itemHeights, layout.itemTops, targetScrollY, viewportSize.height, visualShifts]);
    useLayoutEffect(() => {
        // 目标滚动位置只用于首次填充 DOM。后续换行必须由 animator 根据每
        // 行当前弹簧位置发布空间可见集合，否则会在弹簧尚未抵达目标前卸载
        // 旧行并挂载目标行，形成换行尖峰。
        if (
            viewportSize.height <= 0 ||
            initialVisibilityItemsRef.current === displayItems
        ) return;
        initialVisibilityItemsRef.current = displayItems;
        spatialVisibilityRef.current = { items: displayItems, indices: initialVisibleIndices };
        visibilityStore.set(displayItems, initialVisibleIndices);
    }, [displayItems, initialVisibleIndices, visibilityStore, viewportSize.height]);

    const cachedItemHeights = useMemo(() => layout.itemHeights.map((_height, index) => {
        const measurement = measurements.items === displayItems
            ? measurements.measurements.get(index)
            : undefined;
        return measurement && Math.abs(measurement.width - viewportSize.width) < 0.5
            ? measurement.height
            : null;
    }), [displayItems, layout.itemHeights, measurements, viewportSize.width]);

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
            if (cached && Math.abs(cached.width - measurement.width) < 0.5) return;
            cache.measurements.set(index, measurement);
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
            // 虚拟化只卸载 DOM；真实尺寸测量保留给轻量 row model 复用。
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
            // 宽度变化时保留上一帧的真实行高，等行 ResizeObserver 批量替换。
            // 若先清成统一估算值，多行歌词会在重测完成前短暂压到相邻行上。
            setViewportSize(previous =>
                previous.width === nextSize.width && previous.height === nextSize.height
                    ? previous
                    : nextSize
            );
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => {
            observer.disconnect();
        };
    }, []);

    useLayoutEffect(() => {
        if (viewportSize.width <= 0) return;
        const updates = new Map<number, ItemMeasurement>();
        observedNodesRef.current.forEach(node => {
            const index = nodeIndexesRef.current.get(node);
            const bounds = node.getBoundingClientRect();
            if (index !== undefined) updates.set(index, { height: bounds.height, width: bounds.width });
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

    return {
        activeTargetScrollY,
        cachedItemHeights,
        contentHeight: layout.contentHeight,
        itemHeights: layout.itemHeights,
        itemTops: layout.itemTops,
        observeItem,
        scrollAreaRef,
        setTargetScrollY,
        targetScrollY,
        topSpacerHeight,
        updateVisibleIndices,
        viewportHeight: viewportSize.height,
    };
}
