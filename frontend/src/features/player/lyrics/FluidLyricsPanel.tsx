import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import clsx from 'clsx';
import { motion, type PanInfo } from 'framer-motion';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useFluidLyricsInterlude } from '@/features/player/lyrics/useFluidLyricsInterlude';
import { useFluidLyricsLayout } from '@/features/player/lyrics/useFluidLyricsLayout';
import { useFluidLyricsAnimator } from '@/features/player/lyrics/useFluidLyricsAnimator';
import { usePrecisePlaybackTime } from '@/features/player/lyrics/usePrecisePlaybackTime';
import {
    interludeGapOpenDurationMs,
    interludeNextLineFocusLeadMs,
    manualResumeFollowDelayMs,
    lineSeekSyncToleranceMs,
} from '@/features/player/lyrics/constants';
import { getFluidLyricsMotionDelays, getFluidLyricsSpringParams } from '@/features/player/lyrics/fluidLyricsMotion';
import {
    getInterludeFocusOffsetPx,
    getInterludeNeighborShiftPx,
    getInterludeRowHeightPx,
} from '@/features/player/lyrics/layoutMetrics';
import {
    buildDisplayItems,
    buildFluidLyricsRenderBoundaries,
    getActiveLyricsState,
    getFluidLyricsRenderKey,
    getLineEndMsByIndex,
} from '@/features/player/lyrics/lyricsDisplay';
import { animationLyricsTimingStrategy } from '@/features/player/lyrics/timingStrategy';
import {
    LyricsFrameScheduler,
    LyricsFrameTaskRegistry,
    LyricsFrameSchedulerContext,
    LyricsFrameTaskRegistryContext,
} from '@/features/player/lyrics/lyricsFrameScheduler';
import FluidLyricsLayoutItem from '@/features/player/lyrics/FluidLyricsLayoutItem';
import InterludeItem from '@/features/player/lyrics/InterludeItem';
import LyricsLineItem from '@/features/player/lyrics/LyricsLineItem';
import type { LyricsPanelProps } from '@/features/player/lyrics/types';

const sideScrollMaskStyle = {
    maskImage: 'linear-gradient(to bottom, transparent 0px, black 3.5rem, black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 3.5rem, black calc(100% - 40px), transparent 100%)',
};

const narrowScrollMaskStyle = {
    maskImage: 'linear-gradient(to bottom, transparent 0px, black clamp(1.5rem, calc(6.5vh - 0.5rem), 3.5rem), black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black clamp(1.5rem, calc(6.5vh - 0.5rem), 3.5rem), black calc(100% - 40px), transparent 100%)',
};

const INTERLUDE_FOCUS_OFFSET_RATIO = 0.9;

function FluidLyricsPanel({
    isOpen,
    lyricsDocument,
    status,
    currentTime,
    onSeek,
    onUserScrollDirection,
    variant = 'side',
}: LyricsPanelProps) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const lines = useMemo(() => lyricsDocument?.lines ?? [], [lyricsDocument]);
    const hasTimestamps = (lyricsDocument?.timing_mode ?? 'none') !== 'none';
    const isTtml = lyricsDocument?.origin === 'native-ttml';
    // TTML 与 LRC 共用同一套切换/加速/淡出参数
    const timingStrategy = animationLyricsTimingStrategy;
    const hasDuetLine = useMemo(() => lines.some((line) => line.is_duet === true), [lines]);
    const resumeTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const previousTargetYRef = useRef(0);
    const manualScrollActiveRef = useRef(false);
    const pausedScrollRef = useRef(false);
    const pendingLineSeekRef = useRef<{
        syncRevision: number;
        targetMs: number;
    } | null>(null);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const [pausedScroll, setPausedScroll] = useState(false);
    // The panel owns one frame loop. Child karaoke rows register content work
    // with it instead of allocating one requestAnimationFrame per row.
    const [frameScheduler] = useState(() => new LyricsFrameScheduler());
    const [contentRegistry] = useState(
        () => new LyricsFrameTaskRegistry(frameScheduler, 'content')
    );

    useEffect(() => () => {
        contentRegistry.dispose();
        frameScheduler.dispose();
    }, [contentRegistry, frameScheduler]);

    const displayState = useMemo(() => {
        if (status === 'loading') return '正在加载歌词...';
        if (status === 'error') return '歌词读取失败';
        if (status === 'empty') return '此歌曲无歌词';
        if (!lines.length) return '暂无歌词';
        return null;
    }, [status, lines.length]);
    const focusNextLineByVisualEnd = timingStrategy.focusNextLineByVisualEnd;
    const displayItems = useMemo(
        () => buildDisplayItems(lines, hasTimestamps, timingStrategy),
        [hasTimestamps, lines, timingStrategy]
    );
    const renderBoundaries = useMemo(
        () => buildFluidLyricsRenderBoundaries(displayItems, lines, timingStrategy, isTtml),
        [displayItems, lines, timingStrategy, isTtml]
    );
    const getRenderKey = useCallback(
        (currentMs: number) => getFluidLyricsRenderKey(renderBoundaries, currentMs),
        [renderBoundaries]
    );
    const { renderCurrentMs, preciseMsRef, syncRevision } = usePrecisePlaybackTime(
        currentTime,
        getRenderKey,
        isPlaying,
        frameScheduler,
    );
    const { focusIndex: activeDisplayIndex, activeIndices } = useMemo(
        () => getActiveLyricsState(displayItems, lines, renderCurrentMs / 1000, timingStrategy, isTtml),
        [displayItems, lines, renderCurrentMs, timingStrategy, isTtml]
    );
    const {
        exitingInterludeIndex,
        interludeExitKey,
        keepCurrentInterludeForExit,
        playbackSyncKey,
    } = useFluidLyricsInterlude({
        activeDisplayIndex,
        displayItems,
        currentMs: renderCurrentMs,
        syncRevision,
    });
    const openInterludeIndex = (() => {
        const candidateIndices = [activeDisplayIndex, activeDisplayIndex - 1];
        return candidateIndices.find(displayIndex => {
            const item = displayItems[displayIndex];
            return item?.type === 'interlude' &&
                renderCurrentMs >= item.startMs &&
                renderCurrentMs < item.endMs - interludeNextLineFocusLeadMs;
        }) ?? -1;
    })();
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
    const pendingBackgroundHeightsRef = useRef(new Map<number, number>());
    const backgroundHeightFlushScheduledRef = useRef(false);
    const [backgroundHeights, setBackgroundHeights] = useState<Record<number, number>>({});
    const reportBackgroundHeight = useCallback((displayIndex: number, height: number) => {
        const cache = backgroundHeightsCacheRef.current.items === displayItems
            ? backgroundHeightsCacheRef.current
            : { items: displayItems, heights: {} };
        backgroundHeightsCacheRef.current = cache;
        if (cache.heights[displayIndex] === height) return;
        cache.heights[displayIndex] = height;
        pendingBackgroundHeightsRef.current.set(displayIndex, height);
        if (backgroundHeightFlushScheduledRef.current) return;
        backgroundHeightFlushScheduledRef.current = true;
        queueMicrotask(() => {
            backgroundHeightFlushScheduledRef.current = false;
            pendingBackgroundHeightsRef.current.clear();
            if (backgroundHeightsCacheRef.current !== cache) return;
            setBackgroundHeights({ ...cache.heights });
        });
    }, [displayItems]);

    const activeItem = displayItems[activeDisplayIndex];

    const visualInterludeShifts = useMemo(() => {
        const shifts = new Array<number>(displayItems.length);
        const rowHeight = getInterludeRowHeightPx();
        const neighborShift = getInterludeNeighborShiftPx();
        const openInterludeIndices = new Set(
            [exitingInterludeIndex, openInterludeIndex].filter(
                (displayIndex): displayIndex is number =>
                    displayIndex !== null && displayIndex >= 0
            )
        );
        let shift = 0;

        displayItems.forEach((item, displayIndex) => {
            shifts[displayIndex] = shift;
            if (item.type === 'interlude') {
                if (!openInterludeIndices.has(displayIndex)) shift -= rowHeight;
                return;
            }
            if (item.type === 'line' && item.line.role === 'background') {
                // 布局模型中背景行高度为 0（不占位）；激活时撑开真实高度，
                // 后续行下移补偿（间奏式出现：拉开距离 + 淡入）
                if (activeIndices.has(displayIndex)) {
                    shift += backgroundHeights[displayIndex] ?? 0;
                }
            }
        });

        openInterludeIndices.forEach(interludeIndex => {
            for (let displayIndex = 0; displayIndex < displayItems.length; displayIndex++) {
                if (displayIndex < interludeIndex) shifts[displayIndex] -= neighborShift;
                else if (displayIndex > interludeIndex) shifts[displayIndex] += neighborShift;
            }
        });
        return shifts;
    }, [activeIndices, backgroundHeights, displayItems, exitingInterludeIndex, openInterludeIndex]);

    const {
        activeTargetScrollY,
        contentHeight,
        itemHeights,
        itemTops,
        observeItem,
        scrollAreaRef,
        setTargetScrollY,
        targetScrollY,
        visibleIndices,
        updateVisibleIndices,
        viewportHeight,
        fallbackVisibleIndices,
    } = useFluidLyricsLayout({
        activeDisplayIndex,
        activeFocusOffset: activeItem?.type === 'interlude'
            ? -getInterludeFocusOffsetPx() * INTERLUDE_FOCUS_OFFSET_RATIO
            : 0,
        displayItems,
        includeActiveWindow: !isUserScrolling,
        interludeRowHeight: getInterludeRowHeightPx(),
        variant,
        visualShifts: visualInterludeShifts,
    });

    const updateTargetScrollY = useCallback((value: number) => {
        const nextTarget = setTargetScrollY(value);
        previousTargetYRef.current = nextTarget;
    }, [setTargetScrollY]);

    useEffect(() => {
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
            resumeTimeoutRef.current = null;
        }
        pausedScrollRef.current = false;
        previousTargetYRef.current = 0;
        pendingLineSeekRef.current = null;
        const frame = requestAnimationFrame(() => {
            setPausedScroll(false);
            setIsUserScrolling(false);
        });
        return () => cancelAnimationFrame(frame);
    }, [isOpen, lines]);

    useEffect(() => {
        if (!isPlaying) return;
        pausedScrollRef.current = false;
        const frame = requestAnimationFrame(() => setPausedScroll(false));
        return () => cancelAnimationFrame(frame);
    }, [isPlaying]);

    const shouldAutoFollow = isOpen && !displayState && !isUserScrolling && !pausedScroll;
    const animatorTargetScrollY = shouldAutoFollow ? activeTargetScrollY : targetScrollY;
    useLayoutEffect(() => {
        manualScrollActiveRef.current = isUserScrolling;
        // 同步布局修正/边界钳制后的手动目标，避免下一次输入仍从旧位置累计。
        previousTargetYRef.current = animatorTargetScrollY;
    }, [animatorTargetScrollY, isUserScrolling]);

    const scheduleResumeFollow = useCallback(() => {
        if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
        resumeTimeoutRef.current = window.setTimeout(() => {
            resumeTimeoutRef.current = null;
            setIsUserScrolling(false);
            if (!usePlayerStore.getState().isPlaying) {
                pausedScrollRef.current = true;
                setPausedScroll(true);
                return;
            }
            // 自动跟随直接使用本次渲染的焦点，不回写两秒前捕获的旧目标。
        }, manualResumeFollowDelayMs);
    }, []);

    useEffect(() => () => {
        if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    }, []);

    const handleLineSeek = useCallback((time: number) => {
        keepCurrentInterludeForExit();
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
            resumeTimeoutRef.current = null;
        }
        if (isUserScrolling) {
            pendingLineSeekRef.current = {
                syncRevision,
                targetMs: time * 1000,
            };
        }
        onSeek(time);
    }, [isUserScrolling, keepCurrentInterludeForExit, onSeek, syncRevision]);

    useEffect(() => {
        const pendingSeek = pendingLineSeekRef.current;
        if (!pendingSeek || pendingSeek.syncRevision === syncRevision) return;
        if (Math.abs(renderCurrentMs - pendingSeek.targetMs) > lineSeekSyncToleranceMs) return;

        const frame = requestAnimationFrame(() => {
            if (pendingLineSeekRef.current !== pendingSeek) return;
            pendingLineSeekRef.current = null;
            // seek 已同步到新歌词行后再恢复跟随，避免旧播放位置先进入一次弹簧目标。
            setIsUserScrolling(false);
        });
        return () => cancelAnimationFrame(frame);
    }, [renderCurrentMs, syncRevision]);
    const dynamicSpringParams = useMemo(
        () => getFluidLyricsSpringParams({
            activeDisplayIndex,
            displayItems,
            isPlaying,
            isUserScrolling,
        }),
        [activeDisplayIndex, displayItems, isPlaying, isUserScrolling]
    );
    const motionDelays = useMemo(
        () => getFluidLyricsMotionDelays({
            activeDisplayIndex,
            displayItems,
            isPlaying,
            isUserScrolling,
            itemTops,
            itemHeights,
            visualShifts: visualInterludeShifts,
            targetScrollY: animatorTargetScrollY,
            parentDisplayIndexMap,
            backgroundHeights,
            activeIndices,
        }),
        [activeDisplayIndex, displayItems, isPlaying, isUserScrolling, itemTops, itemHeights,
            visualInterludeShifts, animatorTargetScrollY, parentDisplayIndexMap, backgroundHeights, activeIndices]
    );
    const getMotionDelay = useCallback(
        (displayIndex: number) => motionDelays[displayIndex] ?? 0,
        [motionDelays]
    );
    const { registerAnimatedRow, beginManualScroll } = useFluidLyricsAnimator({
        activeDisplayIndex,
        activeIndices,
        getDelay: getMotionDelay,
        modelIdentity: displayItems,
        rowCount: displayItems.length,
        springParams: dynamicSpringParams,
        targetScrollY: animatorTargetScrollY,
        visualShifts: visualInterludeShifts,
        isUserScrolling,
        pausedScroll,
        variant,
        parentDisplayIndexMap,
        frameScheduler,
        itemTops,
        itemHeights,
        viewportHeight,
        fallbackVisibleIndices,
        onVisibleIndicesChange: updateVisibleIndices,
    });

    const handleManualDelta = useCallback((deltaY: number) => {
        if (!Number.isFinite(deltaY) || deltaY === 0) return;
        pendingLineSeekRef.current = null;
        if (!manualScrollActiveRef.current) {
            manualScrollActiveRef.current = true;
            previousTargetYRef.current = beginManualScroll();
        }
        onUserScrollDirection?.(deltaY > 0 ? 'down' : 'up', Math.abs(deltaY));
        setIsUserScrolling(true);
        if (!isPlaying) {
            pausedScrollRef.current = true;
            setPausedScroll(true);
        }
        updateTargetScrollY(previousTargetYRef.current + deltaY);
        scheduleResumeFollow();
    }, [beginManualScroll, isPlaying, onUserScrollDirection, scheduleResumeFollow, updateTargetScrollY]);

    return (
        <LyricsFrameSchedulerContext.Provider value={frameScheduler}>
            <LyricsFrameTaskRegistryContext.Provider value={contentRegistry}>
                <div className="relative h-full w-full rounded-[22px] overflow-hidden" style={{ contain: 'strict' }}>
                    <motion.div
                        ref={scrollAreaRef}
                        className={clsx(
                            'relative z-10 mt-0 overflow-hidden touch-none',
                            variant === 'narrow' ? 'h-full mb-0' : 'h-[calc(100%-3.5rem)] mb-6'
                        )}
                        style={variant === 'narrow' ? narrowScrollMaskStyle : sideScrollMaskStyle}
                        onPan={(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => handleManualDelta(-info.delta.y)}
                        onWheel={(event: WheelEvent<HTMLDivElement>) => {
                            event.preventDefault();
                            handleManualDelta(event.deltaY);
                        }}
                    >
                        {displayState ? (
                            <div className="h-full flex items-center justify-center text-white/40 text-sm">{displayState}</div>
                        ) : (
                            <div
                                className="relative"
                                data-fluid-display-count={displayItems.length}
                                style={{ height: contentHeight }}
                            >
                                {visibleIndices.map(displayIndex => {
                                    const item = displayItems[displayIndex];
                                    if (!item) return null;
                                    const interludeShift = visualInterludeShifts[displayIndex] ?? 0;
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

                                    return (
                                        <FluidLyricsLayoutItem
                                            key={item.type === 'line' ? `line-${item.lineIndex}` : `interlude-${item.afterLineIndex}-${item.startMs}`}
                                            index={displayIndex}
                                            onAnimateMount={registerAnimatedRow}
                                            onMount={observeItem}
                                            top={itemTops[displayIndex]}
                                        >
                                            {item.type === 'interlude' ? (
                                                <div>
                                                    <InterludeItem
                                                        isActive={isActive}
                                                        forceExiting={displayIndex === exitingInterludeIndex}
                                                        forceExitKey={interludeExitKey}
                                                        playbackSyncKey={playbackSyncKey}
                                                        suppressDots={false}
                                                        currentMs={renderCurrentMs}
                                                        preciseMsRef={preciseMsRef}
                                                        isPlaying={isPlaying}
                                                        startMs={item.startMs}
                                                        endMs={item.endMs}
                                                    />
                                                </div>
                                            ) : (
                                                <LyricsLineItem
                                                    line={item.line}
                                                    isActive={isActive}
                                                    isKaraokeActive={isKaraokeActive}
                                                    isUserScrolling={isUserScrolling}
                                                    pausedScroll={pausedScroll}
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
                                                    lineEndMs={typeof item.line.end_time_ms === 'number' ? item.line.end_time_ms : getLineEndMsByIndex(lines, item.lineIndex)}
                                                    nextLineStartMs={item.line.words?.length ? getLineEndMsByIndex(lines, item.lineIndex) : null}
                                                    enableTightHandoffTailCompression={timingStrategy.compressTightHandoffTail}
                                                    currentTime={renderCurrentMs / 1000}
                                                    preciseMsRef={preciseMsRef}
                                                    isPlaying={isPlaying}
                                                    onSeek={handleLineSeek}
                                                    fluidMotion
                                                    motionDelay={getMotionDelay(displayIndex)}
                                                    variant={variant}
                                                    isBackground={item.line.role === 'background'}
                                                    hasDuetLine={hasDuetLine}
                                                    onBackgroundHeight={
                                                        item.line.role === 'background'
                                                            ? (height) => reportBackgroundHeight(displayIndex, height)
                                                            : undefined
                                                    }
                                                />
                                            )}
                                        </FluidLyricsLayoutItem>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>
                </div>
            </LyricsFrameTaskRegistryContext.Provider>
        </LyricsFrameSchedulerContext.Provider>
    );
}

const areFluidLyricsPanelPropsEqual = (previous: LyricsPanelProps, next: LyricsPanelProps) => (
    previous.isOpen === next.isOpen &&
    previous.lyricsDocument === next.lyricsDocument &&
    previous.status === next.status &&
    previous.onSeek === next.onSeek &&
    previous.onUserScrollDirection === next.onUserScrollDirection &&
    previous.variant === next.variant &&
    previous.playerEffectMode === next.playerEffectMode
);

// 播放时间由内部精确时钟订阅；父组件的进度刷新不应重新执行歌词布局。
export default memo(FluidLyricsPanel, areFluidLyricsPanelPropsEqual);
