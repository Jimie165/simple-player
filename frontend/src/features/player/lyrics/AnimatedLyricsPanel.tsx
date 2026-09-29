import { memo, useCallback, useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import clsx from 'clsx';
import { flushSync } from 'react-dom';
import { motion, type PanInfo } from 'framer-motion';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useThemeStore } from '@/store/useThemeStore';
import { useAnimatedLyricsInterlude } from '@/features/player/lyrics/useAnimatedLyricsInterlude';
import { useAnimatedLyricsLayout, useAnimatedLyricsMeasurements } from '@/features/player/lyrics/useAnimatedLyricsLayout';
import { useAnimatedLyricsAnimator } from '@/features/player/lyrics/useAnimatedLyricsAnimator';
import { usePrecisePlaybackTime } from '@/features/player/lyrics/usePrecisePlaybackTime';
import {
    interludeGapOpenDurationMs,
    interludeNextLineFocusLeadMs,
    manualResumeFollowDelayMs,
    lineSeekSyncToleranceMs,
} from '@/features/player/lyrics/constants';
import { getAnimatedLyricsMotionDelays, getAnimatedLyricsSpringParams } from '@/features/player/lyrics/animatedLyricsMotion';
import {
    buildDisplayItems,
    getLineCompressionHandoffStartMs,
    getLineKaraokeEndMs,
    getLineEndMsByIndex,
} from '@/features/player/lyrics/lyricsDisplay';
import { animationLyricsTimingStrategy } from '@/features/player/lyrics/timingStrategy';
import {
    LyricsFrameScheduler,
    LyricsFrameTaskRegistry,
    LyricsFrameSchedulerContext,
    LyricsFrameTaskRegistryContext,
} from '@/features/player/lyrics/lyricsFrameScheduler';
import { getLyricsDebugSink } from '@/features/player/lyrics/lyricsDebug';
import AnimatedLyricsLayoutItem from '@/features/player/lyrics/AnimatedLyricsLayoutItem';
import InterludeItem from '@/features/player/lyrics/InterludeItem';
import LyricsLineItem from '@/features/player/lyrics/LyricsLineItem';
import type { LyricsPanelProps } from '@/features/player/lyrics/types';
import { createAnimatedLyricsTimeline } from '@/features/player/lyrics/animatedLyricsTimeline';

const sideScrollMaskStyle = {
    maskImage: 'linear-gradient(to bottom, transparent 0px, black 3.5rem, black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 3.5rem, black calc(100% - 40px), transparent 100%)',
};

const narrowScrollMaskStyle = {
    maskImage: 'linear-gradient(to bottom, transparent 0px, black clamp(1.5rem, calc(6.5vh - 0.5rem), 3.5rem), black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black clamp(1.5rem, calc(6.5vh - 0.5rem), 3.5rem), black calc(100% - 40px), transparent 100%)',
};

const INTERLUDE_FOCUS_OFFSET_RATIO = 0.9;

function AnimatedLyricsPanel({
    isOpen,
    lyricsDocument,
    status,
    currentTime,
    onSeek,
    onUserScrollDirection,
    variant = 'side',
}: LyricsPanelProps) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const lyricLineBlendEnabled = useThemeStore(state => state.lyricLineBlendEnabled);
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
    const seekExitFallbackRef = useRef<number | null>(null);
    const [seekExit, setSeekExit] = useState<{
        items: object;
        indices: number[];
        targetMs: number;
        syncRevision: number;
        startedAt: number;
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
    const displayItems = useMemo(
        () => buildDisplayItems(lines, hasTimestamps, timingStrategy),
        [hasTimestamps, lines, timingStrategy]
    );
    const timeline = useMemo(
        () => createAnimatedLyricsTimeline(displayItems, lines, timingStrategy, isTtml),
        [displayItems, lines, timingStrategy, isTtml]
    );
    const { renderCurrentMs, preciseMsRef, syncRevision } = usePrecisePlaybackTime(
        currentTime,
        timeline.getRenderKey,
        isPlaying,
        frameScheduler,
    );
    const { focusIndex: activeDisplayIndex, activeIndices, karaokeActiveIndices } = useMemo(
        () => timeline.getSnapshot(renderCurrentMs, true), [timeline, renderCurrentMs],
    );
    const {
        exitingInterludeIndex,
        interludeExitKey,
        keepCurrentInterludeForExit,
        playbackSyncKey,
    } = useAnimatedLyricsInterlude({
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

    const { snapshot: measurements, backgroundHeights, observeItem, scrollAreaRef } = useAnimatedLyricsMeasurements(displayItems);
    const interludeMetrics = measurements.interludeMetrics;

    const activeItem = displayItems[activeDisplayIndex];

    // The layout fallback must use the same target that the animator follows.
    // Keeping a stale manual target in the automatic-follow window pins old
    // rows (usually the beginning of the song) in the DOM indefinitely.
    const shouldAutoFollow = isOpen && !displayState && !isUserScrolling && !pausedScroll;

    const visualInterludeShifts = useMemo(() => {
        const shifts = new Array<number>(displayItems.length);
        const { rowHeight, neighborShift } = interludeMetrics;
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
    }, [activeIndices, backgroundHeights, displayItems, exitingInterludeIndex, interludeMetrics, openInterludeIndex]);

    const {
        activeTargetScrollY,
        contentHeight,
        itemHeights,
        itemTops,
        setTargetScrollY,
        targetScrollY,
        visibleIndices,
        updateSpringVisibleIndices,
        viewportHeight,
        fallbackVisibleIndices,
    } = useAnimatedLyricsLayout({
        activeDisplayIndex,
        activeFocusOffset: activeItem?.type === 'interlude'
            ? -interludeMetrics.focusOffset * INTERLUDE_FOCUS_OFFSET_RATIO
            : 0,
        displayItems,
        includeActiveWindow: shouldAutoFollow,
        interludeRowHeight: interludeMetrics.rowHeight,
        variant,
        visualShifts: visualInterludeShifts,
        measurements,
        parentDisplayIndexMap,
    });
    const renderedIndices = useMemo(() => seekExit?.items === displayItems && seekExit.indices.length
        ? [...new Set([...visibleIndices, ...seekExit.indices])].sort((left, right) => left - right)
        : visibleIndices, [displayItems, seekExit, visibleIndices]);

    useEffect(() => {
        if (!seekExit || seekExit.items !== displayItems ||
            seekExit.syncRevision === syncRevision ||
            Math.abs(renderCurrentMs - seekExit.targetMs) > lineSeekSyncToleranceMs) return;
        const remainingMs = Math.max(0, 450 - (performance.now() - seekExit.startedAt));
        const timer = window.setTimeout(() => {
            setSeekExit(current => current === seekExit ? null : current);
        }, remainingMs);
        return () => window.clearTimeout(timer);
    }, [displayItems, renderCurrentMs, seekExit, syncRevision]);

    useEffect(() => () => {
        if (seekExitFallbackRef.current !== null) window.clearTimeout(seekExitFallbackRef.current);
    }, []);

    // This is a panel-commit counter, deliberately separate from the
    // MutationObserver batches collected by the profile script. It is only
    // observable while a diagnostics sink is installed.
    useLayoutEffect(() => {
        getLyricsDebugSink()?.({
            type: 'react-commit',
            displayItemCount: displayItems.length,
            visibleRowCount: visibleIndices.length,
            activeDisplayIndex,
        });
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

    const seekContextRef = useRef({ keepCurrentInterludeForExit, isUserScrolling, syncRevision, onSeek, activeIndices, displayItems });
    useInsertionEffect(() => {
        seekContextRef.current = { keepCurrentInterludeForExit, isUserScrolling, syncRevision, onSeek, activeIndices, displayItems };
    }, [keepCurrentInterludeForExit, isUserScrolling, syncRevision, onSeek, activeIndices, displayItems]);
    const handleLineSeek = useCallback((time: number) => {
        const context = seekContextRef.current;
        const targetMs = time * 1000;
        const indices = [...context.activeIndices].filter(index => {
            const item = context.displayItems[index];
            return item?.type === 'line' && item.line.words.length > 0 && item.line.start_time_ms !== targetMs;
        });
        // Commit the exit state before the async seek can publish its new clock to the old row.
        const exit = indices.length ? {
            items: context.displayItems, indices, targetMs,
            syncRevision: context.syncRevision, startedAt: performance.now(),
        } : null;
        flushSync(() => setSeekExit(exit));
        if (seekExitFallbackRef.current !== null) window.clearTimeout(seekExitFallbackRef.current);
        seekExitFallbackRef.current = exit ? window.setTimeout(() => {
            setSeekExit(current => current === exit ? null : current);
        }, 2500) : null;
        context.keepCurrentInterludeForExit();
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
            resumeTimeoutRef.current = null;
        }
        if (context.isUserScrolling) {
            pendingLineSeekRef.current = {
                syncRevision: context.syncRevision,
                targetMs: time * 1000,
            };
        }
        context.onSeek(time);
    }, []);

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
        () => getAnimatedLyricsSpringParams({
            activeDisplayIndex,
            displayItems,
            isPlaying,
            isUserScrolling,
        }),
        [activeDisplayIndex, displayItems, isPlaying, isUserScrolling]
    );
    const motionDelays = useMemo(
        () => getAnimatedLyricsMotionDelays({
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
    const { registerAnimatedRow, beginManualScroll } = useAnimatedLyricsAnimator({
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
        onVisibleIndicesChange: updateSpringVisibleIndices,
        syncRevision,
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
                <div className="relative h-full w-full rounded-[22px] overflow-hidden" style={lyricLineBlendEnabled ? undefined : { contain: 'strict' }}>
                    <motion.div
                        ref={scrollAreaRef}
                        className={clsx(
                            'relative mt-0 overflow-hidden touch-none',
                            !lyricLineBlendEnabled && 'z-10',
                            variant === 'narrow' ? 'h-full mb-0' : 'h-[calc(100%-3.5rem)] mb-6'
                        )}
                        style={lyricLineBlendEnabled ? undefined : variant === 'narrow' ? narrowScrollMaskStyle : sideScrollMaskStyle}
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
                                data-animated-display-count={displayItems.length}
                                style={{ height: contentHeight }}
                            >
                                {renderedIndices.map(displayIndex => {
                                    const item = displayItems[displayIndex];
                                    if (!item) return null;
                                    const interludeShift = visualInterludeShifts[displayIndex] ?? 0;
                                    const isActive = activeIndices.has(displayIndex);
                                    const isKaraokeActive = karaokeActiveIndices.has(displayIndex);

                                    return (
                                        <AnimatedLyricsLayoutItem
                                            key={item.type === 'line' ? `line-${item.lineIndex}` : `interlude-${item.afterLineIndex}-${item.startMs}`}
                                            index={displayIndex}
                                            blendWithBackground={lyricLineBlendEnabled && item.type === 'line'}
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
                                                    isSeekExiting={seekExit?.items === displayItems && seekExit.indices.includes(displayIndex)}
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
                                                    lineEndMs={getLineKaraokeEndMs(item.line, getLineEndMsByIndex(lines, item.lineIndex))}
                                                    nextLineStartMs={item.line.words?.length ? getLineCompressionHandoffStartMs(lines, item.lineIndex) : null}
                                                    enableTightHandoffTailCompression={timingStrategy.compressTightHandoffTail}
                                                    currentTime={renderCurrentMs / 1000}
                                                    preciseMsRef={preciseMsRef}
                                                    isPlaying={isPlaying}
                                                    playbackSyncKey={syncRevision}
                                                    onSeek={handleLineSeek}
                                                    animatedMotion
                                                    motionDelay={getMotionDelay(displayIndex)}
                                                    variant={variant}
                                                    isBackground={item.line.role === 'background'}
                                                    hasDuetLine={hasDuetLine}
                                                />
                                            )}
                                        </AnimatedLyricsLayoutItem>
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

const areAnimatedLyricsPanelPropsEqual = (previous: LyricsPanelProps, next: LyricsPanelProps) => (
    previous.isOpen === next.isOpen &&
    previous.lyricsDocument === next.lyricsDocument &&
    previous.status === next.status &&
    previous.onSeek === next.onSeek &&
    previous.onUserScrollDirection === next.onUserScrollDirection &&
    previous.variant === next.variant &&
    previous.playerEffectMode === next.playerEffectMode
);

// 播放时间由内部精确时钟订阅；父组件的进度刷新不应重新执行歌词布局。
export default memo(AnimatedLyricsPanel, areAnimatedLyricsPanelPropsEqual);
