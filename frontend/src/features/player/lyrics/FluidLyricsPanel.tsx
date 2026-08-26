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
} from '@/features/player/lyrics/constants';
import {
    getFluidLyricsMotionDelay,
    getFluidLyricsSpringParams,
} from '@/features/player/lyrics/fluidLyricsMotion';
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
import FluidLyricsLayoutItem from '@/features/player/lyrics/FluidLyricsLayoutItem';
import InterludeItem from '@/features/player/lyrics/InterludeItem';
import LyricsLineItem from '@/features/player/lyrics/LyricsLineItem';
import type { LyricsPanelProps } from '@/features/player/lyrics/types';
import {
    LyricsFrameScheduler,
    LyricsFrameSchedulerContext,
} from '@/features/player/lyrics/lyricsFrameScheduler';

const sideScrollMaskStyle = {
    maskImage: 'linear-gradient(to bottom, transparent 0px, black 3.5rem, black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 3.5rem, black calc(100% - 40px), transparent 100%)',
};

const narrowScrollMaskStyle = {
    maskImage: 'linear-gradient(to bottom, transparent 0px, black clamp(1.5rem, calc(6.5vh - 0.5rem), 3.5rem), black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black clamp(1.5rem, calc(6.5vh - 0.5rem), 3.5rem), black calc(100% - 40px), transparent 100%)',
};

const INTERLUDE_FOCUS_OFFSET_RATIO = 0.9;
const lineSeekSyncToleranceMs = 1000;

function FluidLyricsPanel({
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
    const pausedScrollRef = useRef(false);
    const firstPositionDoneRef = useRef(false);
    const pendingLineSeekRef = useRef<{
        syncRevision: number;
        targetMs: number;
    } | null>(null);
    const [pendingLineSeek, setPendingLineSeek] = useState<{
        syncRevision: number;
        targetMs: number;
    } | null>(null);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const [pausedScroll, setPausedScroll] = useState(false);
    const [frameScheduler] = useState(() => new LyricsFrameScheduler());

    useEffect(() => () => frameScheduler.dispose(), [frameScheduler]);

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
        true,
        frameScheduler,
    );
    const isLineSeekSync = pendingLineSeek !== null &&
        pendingLineSeek.syncRevision !== syncRevision &&
        Math.abs(renderCurrentMs - pendingLineSeek.targetMs) <= lineSeekSyncToleranceMs;
    const previousSpatialSyncRevisionRef = useRef(syncRevision);
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
        cachedItemHeights,
        contentHeight,
        isViewportResizing,
        itemHeights,
        itemTops,
        observeItem,
        scrollAreaRef,
        setTargetScrollY,
        targetScrollY,
        updateVisibleIndices,
        viewportHeight,
        visibleIndices,
    } = useFluidLyricsLayout({
        activeDisplayIndex,
        activeFocusOffset: activeItem?.type === 'interlude'
            ? -getInterludeFocusOffsetPx() * INTERLUDE_FOCUS_OFFSET_RATIO
            : 0,
        displayItems,
        interludeRowHeight: getInterludeRowHeightPx(),
        variant,
        visualShifts: visualInterludeShifts,
    });

    const updateTargetScrollY = useCallback((value: number) => {
        const nextTarget = setTargetScrollY(value);
        previousTargetYRef.current = nextTarget;
    }, [setTargetScrollY]);

    useEffect(() => {
        firstPositionDoneRef.current = false;
        pausedScrollRef.current = false;
        previousTargetYRef.current = 0;
        pendingLineSeekRef.current = null;
        const frame = requestAnimationFrame(() => {
            setPendingLineSeek(null);
            setPausedScroll(false);
            setIsUserScrolling(false);
            updateTargetScrollY(0);
        });
        return () => cancelAnimationFrame(frame);
    }, [lines, updateTargetScrollY]);

    useEffect(() => {
        if (!isPlaying) return;
        pausedScrollRef.current = false;
        const frame = requestAnimationFrame(() => setPausedScroll(false));
        return () => cancelAnimationFrame(frame);
    }, [isPlaying]);

    useLayoutEffect(() => {
        if (previousSpatialSyncRevisionRef.current === syncRevision) return;
        previousSpatialSyncRevisionRef.current = syncRevision;
        if (displayState || isUserScrolling) return;
        updateTargetScrollY(activeTargetScrollY);
        firstPositionDoneRef.current = true;
    }, [activeTargetScrollY, displayState, isUserScrolling, syncRevision, updateTargetScrollY]);

    useEffect(() => {
        if (displayState || isUserScrolling) return;
        if (!isPlaying && firstPositionDoneRef.current) return;
        const frame = requestAnimationFrame(() => {
            updateTargetScrollY(activeTargetScrollY);
            firstPositionDoneRef.current = true;
        });
        return () => cancelAnimationFrame(frame);
    }, [activeTargetScrollY, displayState, isPlaying, isUserScrolling, updateTargetScrollY]);

    const scheduleResumeFollow = useCallback(() => {
        if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
        resumeTimeoutRef.current = window.setTimeout(() => {
            setIsUserScrolling(false);
            if (!isPlaying) {
                pausedScrollRef.current = true;
                setPausedScroll(true);
                return;
            }
            updateTargetScrollY(activeTargetScrollY);
        }, manualResumeFollowDelayMs);
    }, [activeTargetScrollY, isPlaying, updateTargetScrollY]);

    const handleManualDelta = useCallback((deltaY: number) => {
        pendingLineSeekRef.current = null;
        setPendingLineSeek(null);
        if (deltaY !== 0) onUserScrollDirection?.(deltaY > 0 ? 'down' : 'up', Math.abs(deltaY));
        setIsUserScrolling(true);
        if (!isPlaying) {
            pausedScrollRef.current = true;
            setPausedScroll(true);
        }
        updateTargetScrollY(previousTargetYRef.current + deltaY);
        scheduleResumeFollow();
    }, [isPlaying, onUserScrollDirection, scheduleResumeFollow, updateTargetScrollY]);

    useEffect(() => () => {
        if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    }, []);

    const handleLineSeek = useCallback((time: number) => {
        keepCurrentInterludeForExit();
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
            resumeTimeoutRef.current = null;
        }
        const pendingSeek = {
            syncRevision,
            targetMs: time * 1000,
        };
        pendingLineSeekRef.current = pendingSeek;
        setPendingLineSeek(pendingSeek);
        onSeek(time);
    }, [keepCurrentInterludeForExit, onSeek, syncRevision]);

    useEffect(() => {
        const pendingSeek = pendingLineSeekRef.current;
        if (!pendingSeek || pendingSeek.syncRevision === syncRevision) return;
        if (Math.abs(renderCurrentMs - pendingSeek.targetMs) > lineSeekSyncToleranceMs) return;

        const frame = requestAnimationFrame(() => {
            if (pendingLineSeekRef.current !== pendingSeek) return;
            pendingLineSeekRef.current = null;
            setPendingLineSeek(null);
            // seek 已同步到新歌词行后再恢复跟随，避免旧播放位置先进入一次弹簧目标。
            firstPositionDoneRef.current = false;
            setIsUserScrolling(false);
        });
        return () => cancelAnimationFrame(frame);
    }, [renderCurrentMs, syncRevision]);
    const dynamicSpringParams = useMemo(
        () => getFluidLyricsSpringParams({
            activeDisplayIndex,
            displayItems,
            focusNextLineByVisualEnd,
            isPlaying,
            isSeeking: isLineSeekSync,
            isUserScrolling,
            variant,
        }),
        [activeDisplayIndex, displayItems, focusNextLineByVisualEnd, isLineSeekSync, isPlaying, isUserScrolling, variant]
    );
    const getMotionDelay = useCallback(
        (displayIndex: number) => getFluidLyricsMotionDelay({
            activeDisplayIndex,
            displayItems,
            focusNextLineByVisualEnd,
            isPlaying,
            isSeeking: isLineSeekSync,
            isUserScrolling,
            variant,
        }, displayIndex),
        [activeDisplayIndex, displayItems, focusNextLineByVisualEnd, isLineSeekSync, isPlaying, isUserScrolling, variant]
    );
    const registerAnimatedRow = useFluidLyricsAnimator({
        activeDisplayIndex,
        activeIndices,
        getDelay: getMotionDelay,
        modelIdentity: displayItems,
        rowCount: displayItems.length,
        springParams: dynamicSpringParams,
        targetScrollY,
        visualShifts: visualInterludeShifts,
        isUserScrolling,
        pausedScroll,
        variant,
        parentDisplayIndexMap,
        frameScheduler,
        itemHeights,
        itemTops,
        onVisibleIndicesChange: updateVisibleIndices,
        preserveMotionOnSync: isLineSeekSync,
        suppressRowDelay: isViewportResizing,
        syncRevision,
        viewportHeight,
    });

    return (
        <LyricsFrameSchedulerContext.Provider value={frameScheduler}>
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
                    <div className="relative" style={{ height: contentHeight }}>
                        {visibleIndices.map(displayIndex => {
                            const item = displayItems[displayIndex];
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
                                            onSeek={handleLineSeek}
                                            fluidMotion
                                            motionDelay={getMotionDelay(displayIndex)}
                                            variant={variant}
                                            isBackground={item.line.role === 'background'}
                                            hasDuetLine={hasDuetLine}
                                            cachedRowHeight={cachedItemHeights[displayIndex]}
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
