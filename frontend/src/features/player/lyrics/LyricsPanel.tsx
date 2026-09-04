import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { usePlayerStore } from '@/store/usePlayerStore';
import {
    interludeExitCollapseDelayMs,
    interludeGapOpenDurationMs,
    interludeNextLineFocusLeadMs,
    manualResumeFollowDelayMs,
    sideLyricsFocusAlpha,
    topInsetPx,
} from '@/features/player/lyrics/constants';
import InterludeItem from '@/features/player/lyrics/InterludeItem';
import { getInterludeFocusOffsetPx, getInterludeRowHeightPx } from '@/features/player/lyrics/layoutMetrics';
import LyricsLineItem from '@/features/player/lyrics/LyricsLineItem';
import {
    buildDisplayItems,
    getActiveLyricsState,
    getLineEndMsByIndex,
} from '@/features/player/lyrics/lyricsDisplay';
import { performanceLyricsTimingStrategy } from '@/features/player/lyrics/timingStrategy';
import { PerformanceLyricsScroll } from '@/features/player/lyrics/performanceLyricsScroll';
import type { DisplayItem, LyricsPanelProps } from '@/features/player/lyrics/types';
import { usePrecisePlaybackTime } from '@/features/player/lyrics/usePrecisePlaybackTime';

const sideScrollMaskStyle = {
    maskImage:
        'linear-gradient(to bottom, transparent 0px, black 3.5rem, black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage:
        'linear-gradient(to bottom, transparent 0px, black 3.5rem, black calc(100% - 40px), transparent 100%)',
};

const narrowScrollMaskStyle = {
    maskImage:
        'linear-gradient(to bottom, transparent 0px, black clamp(1.5rem, calc(6.5vh - 0.5rem), 3.5rem), black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage:
        'linear-gradient(to bottom, transparent 0px, black clamp(1.5rem, calc(6.5vh - 0.5rem), 3.5rem), black calc(100% - 40px), transparent 100%)',
};

const NARROW_LYRICS_FOCUS_ALPHA = 0.15;
const NARROW_LYRICS_END_STOP_OFFSET = 56;

export default function LyricsPanel({
    isOpen,
    lyricsDocument,
    status,
    currentTime,
    onSeek,
    onUserScrollDirection,
    variant,
}: LyricsPanelProps) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const lines = useMemo(() => lyricsDocument?.lines ?? [], [lyricsDocument]);
    const hasTimestamps = (lyricsDocument?.timing_mode ?? 'none') !== 'none';
    const isTtml = lyricsDocument?.origin === 'native-ttml';
    // TTML 与 LRC 共用同一套切换/加速/淡出参数
    const timingStrategy = performanceLyricsTimingStrategy;
    const hasDuetLine = useMemo(() => lines.some((line) => line.is_duet === true), [lines]);
    const { renderCurrentMs, preciseMsRef } = usePrecisePlaybackTime(currentTime);
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
    const scrollerRef = useRef<HTMLElement | null>(null);
    const [autoScroll] = useState(() => new PerformanceLyricsScroll());
    const userScrollingRef = useRef(false);
    const totalListHeightRef = useRef<number | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const [topSpacerHeight, setTopSpacerHeight] = useState(0);
    const [bottomSpacerHeight, setBottomSpacerHeight] = useState(0);
    const viewportSizeRef = useRef<{ width: number; height: number } | null>(null);
    const [layoutVersion, setLayoutVersion] = useState(0);
    const [recenterVersion, setRecenterVersion] = useState(0);
    const firstScrollDoneRef = useRef(false);
    const lastAutoScrollIndexRef = useRef<number | null>(null);
    const preferSmoothAutoScrollRef = useRef(false);
    const pausedScrollRef = useRef(false);
    const interludeExitTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const previousPlaybackMsRef = useRef(currentTime * 1000);
    const exitingInterludeIndexRef = useRef<number | null>(null);
    const [exitingInterludeIndex, setExitingInterludeIndex] = useState<number | null>(null);
    const [interludeExitKey, setInterludeExitKey] = useState(0);
    const [playbackSyncKey, setPlaybackSyncKey] = useState(0);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const userScrollTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const lastTouchYRef = useRef<number | null>(null);

    useEffect(() => {
        const el = scrollAreaRef.current;
        if (!el) return;
        const update = () => {
            const width = el.clientWidth;
            const height = el.clientHeight;
            const prevSize = viewportSizeRef.current;

            const alpha = variant === 'narrow' ? NARROW_LYRICS_FOCUS_ALPHA : sideLyricsFocusAlpha;
            setTopSpacerHeight(height * alpha);
            setBottomSpacerHeight(
                variant === 'narrow'
                    ? Math.max(0, height * (1 - alpha) - NARROW_LYRICS_END_STOP_OFFSET)
                    : height * (1 - alpha)
            );

            if (prevSize && (prevSize.width !== width || prevSize.height !== height)) {
                setLayoutVersion(version => version + 1);
            }

            viewportSizeRef.current = { width, height };
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [variant]);

    const Header = useCallback(
        () => <div style={{ height: topSpacerHeight + topInsetPx }} aria-hidden />,
        [topSpacerHeight]
    );
    const Footer = useCallback(
        () => <div style={{ height: bottomSpacerHeight }} aria-hidden />,
        [bottomSpacerHeight]
    );

    const setScroller = useCallback((element: HTMLElement | Window | null) => {
        if (element !== scrollerRef.current) autoScroll.cancel();
        scrollerRef.current = element instanceof HTMLElement ? element : null;
    }, [autoScroll]);
    const handleTotalListHeightChanged = useCallback((height: number) => {
        const previous = totalListHeightRef.current;
        totalListHeightRef.current = height;
        // 测量纠正只在自动跟随时重新对齐，手动浏览不能被新挂载行抢回。
        if (previous !== null && Math.abs(previous - height) >= 0.5 && !userScrollingRef.current) {
            setLayoutVersion(version => version + 1);
        }
    }, []);

    const handleUserInteraction = (direction?: 'up' | 'down', delta?: number) => {
        autoScroll.cancel();
        if (!userScrollingRef.current) {
            userScrollingRef.current = true;
            const scroller = scrollerRef.current;
            // 直接停止浏览器的平滑滚动，Virtuoso.scrollTo 在目标等于当前位置时会提前返回。
            scroller?.scrollTo({ top: scroller.scrollTop, behavior: 'instant' });
        }
        if (direction) onUserScrollDirection?.(direction, delta);
        setIsUserScrolling(true);
        lastAutoScrollIndexRef.current = null;
        preferSmoothAutoScrollRef.current = true;
        if (!isPlaying) pausedScrollRef.current = true;
        if (userScrollTimeoutRef.current) {
            clearTimeout(userScrollTimeoutRef.current);
        }
        userScrollTimeoutRef.current = setTimeout(() => {
            userScrollingRef.current = false;
            setIsUserScrolling(false);
            userScrollTimeoutRef.current = null;
        }, manualResumeFollowDelayMs);
    };

    useEffect(() => {
        if (!isPlaying || !isOpen) {
            autoScroll.cancel();
            lastAutoScrollIndexRef.current = null;
        }
        return () => autoScroll.cancel();
    }, [autoScroll, isPlaying, isOpen, lines]);

    useEffect(() => {
        return () => {
            if (userScrollTimeoutRef.current) {
                clearTimeout(userScrollTimeoutRef.current);
            }
            if (interludeExitTimeoutRef.current) {
                clearTimeout(interludeExitTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        firstScrollDoneRef.current = false;
        totalListHeightRef.current = null;
        lastAutoScrollIndexRef.current = null;
        preferSmoothAutoScrollRef.current = false;
    }, [isOpen, lines]);

    useEffect(() => {
        if (!isOpen || !hasTimestamps || lines.length === 0) return;

        const timeout = window.setTimeout(() => {
            lastAutoScrollIndexRef.current = null;
            preferSmoothAutoScrollRef.current = true;
            setRecenterVersion(version => version + 1);
        }, 120);

        return () => window.clearTimeout(timeout);
    }, [hasTimestamps, isOpen, lines]);

    useEffect(() => {
        if (layoutVersion === 0) return;
        lastAutoScrollIndexRef.current = null;
        preferSmoothAutoScrollRef.current = true;
    }, [layoutVersion]);

    useEffect(() => {
        if (isPlaying) pausedScrollRef.current = false;
    }, [isPlaying]);

    const displayState = useMemo(() => {
        if (status === 'loading') return '正在加载歌词...';
        if (status === 'error') return '歌词读取失败';
        if (status === 'empty') return '此歌曲无歌词';
        if (!lines.length) return '暂无歌词';
        return null;
    }, [status, lines.length]);

    const enableTightHandoffTailCompression = timingStrategy.compressTightHandoffTail;
    const focusNextLineByVisualEnd = timingStrategy.focusNextLineByVisualEnd;
    const displayItems = useMemo(
        () => buildDisplayItems(lines, hasTimestamps, timingStrategy),
        [hasTimestamps, lines, timingStrategy]
    );
    const { focusIndex: activeDisplayIndex, activeIndices } = useMemo(
        () => getActiveLyricsState(displayItems, lines, renderCurrentMs / 1000, timingStrategy, isTtml),
        [displayItems, lines, renderCurrentMs, timingStrategy, isTtml]
    );

    useEffect(() => {
        exitingInterludeIndexRef.current = exitingInterludeIndex;
    }, [exitingInterludeIndex]);

    const parentDisplayIndexMap = useMemo(() => {
        const map = new Map<number, number>();
        const lineIdToDisplayIndex = new Map<string, number>();
        displayItems.forEach((item, index) => {
            if (item.type === 'line' && item.line.id) {
                lineIdToDisplayIndex.set(item.line.id, index);
            }
        });
        displayItems.forEach((item, index) => {
            if (item.type === 'line' && item.line.role === 'background' && item.line.parent_id) {
                const parentIdx = lineIdToDisplayIndex.get(item.line.parent_id);
                if (parentIdx !== undefined) {
                    map.set(index, parentIdx);
                }
            }
        });
        return map;
    }, [displayItems]);

    const backgroundHeightsCacheRef = useRef<{
        items: typeof displayItems;
        heights: Record<number, number>;
    }>({ items: displayItems, heights: {} });
    const [backgroundHeights, setBackgroundHeights] = useState<Record<number, number>>({});
    const reportBackgroundHeight = useCallback((displayIndex: number, height: number) => {
        const cache = backgroundHeightsCacheRef.current.items === displayItems
            ? backgroundHeightsCacheRef.current
            : { items: displayItems, heights: {} };
        backgroundHeightsCacheRef.current = cache;
        if (cache.heights[displayIndex] === height) return;
        cache.heights[displayIndex] = height;
        setBackgroundHeights({ ...cache.heights });
    }, [displayItems]);

    const visualInterludeShifts = useMemo(() => {
        const shifts = new Array<number>(displayItems.length);
        const rowHeight = getInterludeRowHeightPx();
        let shift = 0;

        displayItems.forEach((item, displayIndex) => {
            shifts[displayIndex] = shift;
            if (item.type === 'interlude') {
                const closeAtMs = item.endMs - interludeNextLineFocusLeadMs;
                const isOpen =
                    displayIndex === exitingInterludeIndex ||
                    (renderCurrentMs >= item.startMs && renderCurrentMs < closeAtMs);
                if (!isOpen) shift -= rowHeight;
                return;
            }
            if (item.type === 'line' && item.line.role === 'background') {
                // 背景行未激活：后续行上移其高度补偿（间奏式折叠，不占位）
                if (!activeIndices.has(displayIndex)) shift -= backgroundHeights[displayIndex] ?? 0;
            }
        });

        return shifts;
    }, [activeIndices, backgroundHeights, displayItems, exitingInterludeIndex, renderCurrentMs]);
    const getVisualInterludeShift = useCallback(
        (displayIndex: number) => visualInterludeShifts[displayIndex] ?? 0,
        [visualInterludeShifts]
    );

    const startInterludeExit = useCallback((displayIndex: number) => {
        if (displayItems[displayIndex]?.type !== 'interlude') return;
        if (exitingInterludeIndexRef.current === displayIndex) return;

        if (interludeExitTimeoutRef.current) {
            clearTimeout(interludeExitTimeoutRef.current);
        }

        exitingInterludeIndexRef.current = displayIndex;
        setExitingInterludeIndex(displayIndex);
        setInterludeExitKey(key => key + 1);
        interludeExitTimeoutRef.current = window.setTimeout(() => {
            exitingInterludeIndexRef.current = null;
            setExitingInterludeIndex(null);
            interludeExitTimeoutRef.current = null;
        }, interludeExitCollapseDelayMs);
    }, [displayItems]);

    const keepCurrentInterludeForExit = useCallback(() => {
        const activeItem = displayItems[activeDisplayIndex];
        if (activeItem?.type !== 'interlude') return;
        if (renderCurrentMs < activeItem.startMs + interludeGapOpenDurationMs) return;

        startInterludeExit(activeDisplayIndex);
    }, [activeDisplayIndex, displayItems, renderCurrentMs, startInterludeExit]);

    const handleLineSeek = useCallback((time: number) => {
        keepCurrentInterludeForExit();
        if (userScrollTimeoutRef.current) {
            clearTimeout(userScrollTimeoutRef.current);
            userScrollTimeoutRef.current = null;
        }
        //歌词点击 Seek 时立即 resetScroll，避免 pointerdown 留下的手动滚动
        // 状态阻塞新激活行的高亮和跟随。
        userScrollingRef.current = false;
        setIsUserScrolling(false);
        lastAutoScrollIndexRef.current = null;
        preferSmoothAutoScrollRef.current = true;
        onSeek(time);
    }, [keepCurrentInterludeForExit, onSeek]);

    useEffect(() => {
        const previousMs = previousPlaybackMsRef.current;
        const currentMs = renderCurrentMs;
        previousPlaybackMsRef.current = currentMs;

        if (Math.abs(currentMs - previousMs) < 900) return;

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
            return;
        }

        const syncFrame = requestAnimationFrame(() => {
            setPlaybackSyncKey(key => key + 1);
        });

        const previousInterludeIndex = displayItems.findIndex((item) =>
            item.type === 'interlude' &&
            previousMs >= item.startMs + interludeGapOpenDurationMs &&
            previousMs < item.endMs - interludeNextLineFocusLeadMs
        );

        if (previousInterludeIndex < 0) return () => cancelAnimationFrame(syncFrame);

        const previousInterlude = displayItems[previousInterludeIndex] as Extract<DisplayItem, { type: 'interlude' }>;
        const stillInSameInterlude =
            currentMs >= previousInterlude.startMs &&
            currentMs < previousInterlude.endMs;

        if (!stillInSameInterlude) {
            startInterludeExit(previousInterludeIndex);
        }

        return () => cancelAnimationFrame(syncFrame);
    }, [displayItems, renderCurrentMs, startInterludeExit]);

    const getAutoScrollOffset = useCallback(
        (displayIndex: number) => {
            const item = displayItems[displayIndex];
            const visualShift = getVisualInterludeShift(displayIndex);
            const interludeFocusOffset = item?.type === 'interlude' ? getInterludeFocusOffsetPx() : 0;

            const baseOffset = Math.round(visualShift + interludeFocusOffset);
            if (viewportSizeRef.current) {
                const alpha = variant === 'narrow' ? NARROW_LYRICS_FOCUS_ALPHA : sideLyricsFocusAlpha;
                const shiftUp = Math.round(viewportSizeRef.current.height * (0.5 - alpha));
                return baseOffset + shiftUp;
            }
            return baseOffset;
        },
        [displayItems, getVisualInterludeShift, variant]
    );

    useEffect(() => {
        if (!isOpen || !hasTimestamps || lines.length === 0) return;
        if (!isPlaying) return;
        if (activeDisplayIndex < 0) {
            autoScroll.cancel();
            lastAutoScrollIndexRef.current = null;
            return;
        }
        if (isUserScrolling) return;
        if (lastAutoScrollIndexRef.current === activeDisplayIndex) return;

        const previousAutoScrollIndex = lastAutoScrollIndexRef.current;
        const previousAutoScrollItem =
            previousAutoScrollIndex === null ? null : displayItems[previousAutoScrollIndex];
        const activeDisplayItem = displayItems[activeDisplayIndex];
        const isPostInterludeLineTransition =
            previousAutoScrollItem?.type === 'interlude' &&
            activeDisplayItem?.type === 'line' &&
            previousAutoScrollIndex !== null &&
            activeDisplayIndex === previousAutoScrollIndex + 1;

        if (isPostInterludeLineTransition) {
            lastAutoScrollIndexRef.current = activeDisplayIndex;
            preferSmoothAutoScrollRef.current = false;
            return;
        }

        const scroll = () => {
            if (userScrollingRef.current) return;
            const virtuoso = virtuosoRef.current;
            if (!virtuoso) return;
            // 借用列表测量定位，但返回 null 阻止 scrollToIndex 的 listRefresh 重试链。
            // 否则用户已经滚走后，旧定位仍会在下一次行高测量时把画面拉回。
            virtuoso.scrollIntoView({
                index: activeDisplayIndex,
                calculateViewLocation: ({ itemTop, itemBottom, viewportTop, viewportBottom }) => {
                    if (userScrollingRef.current) return null;
                    const scroller = scrollerRef.current;
                    if (!scroller) return null;
                    autoScroll.move(
                        scroller,
                        activeDisplayIndex,
                        (itemTop + itemBottom - (viewportBottom - viewportTop)) / 2 + getAutoScrollOffset(activeDisplayIndex),
                        firstScrollDoneRef.current || preferSmoothAutoScrollRef.current,
                    );
                    return null;
                },
            });
            firstScrollDoneRef.current = true;
            lastAutoScrollIndexRef.current = activeDisplayIndex;
            preferSmoothAutoScrollRef.current = false;
        };

        const raf = requestAnimationFrame(scroll);
        return () => cancelAnimationFrame(raf);
    }, [activeDisplayIndex, autoScroll, displayItems, getAutoScrollOffset, isOpen, hasTimestamps, lines.length, isUserScrolling, isPlaying, layoutVersion, recenterVersion]);

    return (
        <div className="relative h-full w-full rounded-[22px] overflow-hidden">
            <div
                ref={scrollAreaRef}
                className={clsx(
                    'relative z-10 mt-0',
                    variant === 'narrow'
                        ? 'h-full mb-0'
                        : 'h-[calc(100%-3.5rem)] mb-6'
                )}
                style={variant === 'narrow' ? narrowScrollMaskStyle : sideScrollMaskStyle}
                onWheel={(event) => handleUserInteraction(event.deltaY > 0 ? 'down' : 'up', Math.abs(event.deltaY))}
                onTouchStart={(event) => {
                    lastTouchYRef.current = event.touches[0]?.clientY ?? null;
                }}
                onTouchMove={(event) => {
                    const nextY = event.touches[0]?.clientY;
                    const previousY = lastTouchYRef.current;
                    const direction = previousY === null || nextY === undefined
                        ? undefined
                        : nextY < previousY ? 'down' : 'up';
                    lastTouchYRef.current = nextY ?? null;
                    handleUserInteraction(direction, previousY === null || nextY === undefined ? undefined : Math.abs(nextY - previousY));
                }}
                onPointerDown={() => handleUserInteraction()}
            >
                {displayState ? (
                    <div className="h-full flex items-center justify-center text-white/40 text-sm">
                        {displayState}
                    </div>
                ) : (
                    <Virtuoso
                        ref={virtuosoRef}
                        scrollerRef={setScroller}
                        totalListHeightChanged={handleTotalListHeightChanged}
                        className="h-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-none]"
                        data={displayItems}
                        components={{ Header, Footer }}
                        defaultItemHeight={90}
                        increaseViewportBy={{ top: 520, bottom: 520 }}
                        itemContent={(displayIndex, item) => {
                            const interludeShift = getVisualInterludeShift(displayIndex);
                            const isActive = activeIndices.has(displayIndex);
                            const isKaraokeActive = item.type === 'line' && item.line.words?.length
                                ? isActive || (
                                    focusNextLineByVisualEnd &&
                                    typeof item.line.visual_end_ms === 'number' &&
                                    typeof item.line.end_time_ms === 'number' &&
                                    item.line.visual_end_ms < item.line.end_time_ms &&
                                    renderCurrentMs >= item.line.visual_end_ms &&
                                    renderCurrentMs < item.line.end_time_ms
                                )
                                : isActive;

                            if (item.type === 'interlude') {
                                return (
                                    <div
                                        style={{
                                            transform: `translateY(${interludeShift}px)`,
                                            transition: `transform ${interludeGapOpenDurationMs}ms cubic-bezier(0.25, 1, 0.5, 1)`,
                                            willChange: 'transform',
                                        }}
                                    >
                                        <InterludeItem
                                            isActive={isActive}
                                            forceExiting={displayIndex === exitingInterludeIndex}
                                            forceExitKey={interludeExitKey}
                                            playbackSyncKey={playbackSyncKey}
                                            suppressDots={false}
                                            currentMs={renderCurrentMs}
                                            preciseMsRef={preciseMsRef}
                                            startMs={item.startMs}
                                            endMs={item.endMs}
                                        />
                                    </div>
                                );
                            }

                            return (
                                <LyricsLineItem
                                    line={item.line}
                                    isActive={isActive}
                                    isKaraokeActive={isKaraokeActive}
                                    isUserScrolling={isUserScrolling}
                                    pausedScroll={pausedScrollRef.current}
                                    distanceFromActive={
                                        activeDisplayIndex >= 0
                                            ? Math.abs(
                                                activeDisplayIndex -
                                                (parentDisplayIndexMap.get(displayIndex) ?? displayIndex)
                                            )
                                            : 0
                                    }
                                    interludeShift={interludeShift}
                                    interludeShiftDurationMs={interludeGapOpenDurationMs}
                                    lineEndMs={
                                        typeof item.line.end_time_ms === 'number'
                                            ? item.line.end_time_ms
                                            : getLineEndMsByIndex(lines, item.lineIndex)
                                    }
                                    nextLineStartMs={
                                        item.line.words?.length
                                            ? getLineEndMsByIndex(lines, item.lineIndex)
                                            : null
                                    }
                                    enableTightHandoffTailCompression={enableTightHandoffTailCompression}
                                    currentTime={renderCurrentMs / 1000}
                                    preciseMsRef={preciseMsRef}
                                    onSeek={handleLineSeek}
                                    variant={variant}
                                    isBackground={item.line.role === 'background'}
                                    hasDuetLine={hasDuetLine}
                                    onBackgroundHeight={
                                        item.line.role === 'background'
                                            ? (height) => reportBackgroundHeight(displayIndex, height)
                                            : undefined
                                    }
                                />
                            );
                        }}
                    />
                )}
            </div>
        </div>
    );
}
