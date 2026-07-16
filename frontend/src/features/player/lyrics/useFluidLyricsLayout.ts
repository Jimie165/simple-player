import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sideLyricsFocusAlpha, topInsetPx } from '@/features/player/lyrics/constants';
import type { DisplayItem } from '@/features/player/lyrics/types';

const DEFAULT_LINE_HEIGHT_PX = 90;
const NARROW_LYRICS_FOCUS_ALPHA = 0.15;
const NARROW_LYRICS_END_STOP_OFFSET = 56;
const OVERSCAN_PX = 300;
const RETAINED_WINDOW_DURATION_MS = 1600;

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
    const lastViewportWidthRef = useRef(0);
    const maxScrollYRef = useRef(0);
    const targetScrollYRef = useRef(0);
    const retainedWindowTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const [measurements, setMeasurements] = useState<{
        items: DisplayItem[];
        heights: Map<number, number>;
    }>({ items: displayItems, heights: new Map() });
    const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
    const [targetScrollY, setTargetScrollYState] = useState(0);
    const [retainedScrollY, setRetainedScrollY] = useState<number | null>(null);

    const focusAlpha = variant === 'narrow' ? NARROW_LYRICS_FOCUS_ALPHA : sideLyricsFocusAlpha;
    const topSpacerHeight = viewportSize.height * focusAlpha;
    const bottomSpacerHeight = variant === 'narrow'
        ? Math.max(0, viewportSize.height * (1 - focusAlpha) - NARROW_LYRICS_END_STOP_OFFSET)
        : viewportSize.height * (1 - focusAlpha);

    const layout = useMemo(() => {
        const measuredHeights = measurements.items === displayItems
            ? measurements.heights
            : new Map<number, number>();
        const itemTops = new Array<number>(displayItems.length);
        const itemHeights = new Array<number>(displayItems.length);
        let cursor = topSpacerHeight + topInsetPx;

        displayItems.forEach((item, index) => {
            const estimatedHeight = item.type === 'interlude' ? interludeRowHeight : DEFAULT_LINE_HEIGHT_PX;
            const height = measuredHeights.get(index) ?? estimatedHeight;
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

    const setTargetScrollY = useCallback((value: number, retainPrevious = true) => {
        const nextTarget = clamp(value, 0, maxScrollYRef.current);
        const previousTarget = targetScrollYRef.current;

        if (retainPrevious && Math.abs(nextTarget - previousTarget) > OVERSCAN_PX) {
            setRetainedScrollY(previousTarget);
            if (retainedWindowTimerRef.current) clearTimeout(retainedWindowTimerRef.current);
            retainedWindowTimerRef.current = window.setTimeout(() => {
                setRetainedScrollY(null);
                retainedWindowTimerRef.current = null;
            }, RETAINED_WINDOW_DURATION_MS);
        } else if (!retainPrevious) {
            if (retainedWindowTimerRef.current) clearTimeout(retainedWindowTimerRef.current);
            retainedWindowTimerRef.current = null;
            setRetainedScrollY(null);
        }

        targetScrollYRef.current = nextTarget;
        setTargetScrollYState(nextTarget);
        return nextTarget;
    }, []);

    const visibleIndices = useMemo(() => {
        const windows = [targetScrollY];
        if (includeActiveWindow) windows.push(activeTargetScrollY);
        if (retainedScrollY !== null) windows.push(retainedScrollY);

        const result: number[] = [];
        displayItems.forEach((_item, index) => {
            const visualTop = layout.itemTops[index] + (visualShifts[index] ?? 0);
            const visualBottom = visualTop + layout.itemHeights[index];
            const isVisible = windows.some(windowTop =>
                visualBottom >= windowTop - OVERSCAN_PX &&
                visualTop <= windowTop + viewportSize.height + OVERSCAN_PX
            );
            if (isVisible) result.push(index);
        });
        return result;
    }, [activeTargetScrollY, displayItems, includeActiveWindow, layout.itemHeights, layout.itemTops, retainedScrollY, targetScrollY, viewportSize.height, visualShifts]);

    const measureItem = useCallback((index: number, height: number) => {
        if (height <= 0) return;
        setMeasurements(previous => {
            const previousHeights = previous.items === displayItems
                ? previous.heights
                : new Map<number, number>();
            if (previousHeights.get(index) === height && previous.items === displayItems) return previous;
            const nextHeights = new Map(previousHeights);
            nextHeights.set(index, height);
            return { items: displayItems, heights: nextHeights };
        });
    }, [displayItems]);

    const observeItem = useCallback((index: number, node: HTMLDivElement) => {
        nodeIndexesRef.current.set(node, index);
        observedNodesRef.current.add(node);
        measureItem(index, node.offsetHeight);
        itemObserverRef.current?.observe(node);

        return () => {
            itemObserverRef.current?.unobserve(node);
            observedNodesRef.current.delete(node);
        };
    }, [measureItem]);

    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            entries.forEach(entry => {
                const index = nodeIndexesRef.current.get(entry.target);
                const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
                if (index !== undefined) measureItem(index, height);
            });
        });
        itemObserverRef.current = observer;
        observedNodesRef.current.forEach(node => observer.observe(node));
        return () => {
            observer.disconnect();
            if (itemObserverRef.current === observer) itemObserverRef.current = null;
        };
    }, [measureItem]);

    useEffect(() => {
        const element = scrollAreaRef.current;
        if (!element) return;

        const update = () => {
            const nextSize = { width: element.clientWidth, height: element.clientHeight };
            const previousWidth = lastViewportWidthRef.current;
            lastViewportWidthRef.current = nextSize.width;
            if (previousWidth > 0 && previousWidth !== nextSize.width) {
                setMeasurements({ items: displayItems, heights: new Map() });
            }
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
    }, [displayItems]);

    useEffect(() => {
        maxScrollYRef.current = maxScrollY;
        if (targetScrollYRef.current <= maxScrollY) return;
        setTargetScrollY(maxScrollY);
    }, [maxScrollY, setTargetScrollY]);

    useEffect(() => () => {
        if (retainedWindowTimerRef.current) clearTimeout(retainedWindowTimerRef.current);
    }, []);

    return {
        activeTargetScrollY,
        contentHeight: layout.contentHeight,
        itemTops: layout.itemTops,
        observeItem,
        scrollAreaRef,
        setTargetScrollY,
        targetScrollY,
        topSpacerHeight,
        visibleIndices,
    };
}
