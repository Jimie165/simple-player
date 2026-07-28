import { memo, useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
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
import { getFluidLyricsMotionDelay, getFluidLyricsSpringParams } from '@/features/player/lyrics/fluidLyricsMotion';
import {
    getInterludeFocusOffsetPx,
    getInterludeNeighborShiftPx,
    getInterludeRowHeightPx,
} from '@/features/player/lyrics/layoutMetrics';
import {
    buildDisplayItems,
    buildFluidLyricsRenderBoundaries,
    getActiveDisplayIndex,
    getFluidLyricsRenderKey,
    getLineEndMsByIndex,
} from '@/features/player/lyrics/lyricsDisplay';
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
const lineSeekSyncToleranceMs = 1000;

function FluidLyricsPanel({
    isOpen,
    lyrics,
    status,
    hasTimestamps,
    currentTime,
    onSeek,
    onUserScrollDirection,
    variant = 'side',
    timingStrategy,
}: LyricsPanelProps) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const lines = useMemo(() => lyrics ?? [], [lyrics]);
    const resumeTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const previousTargetYRef = useRef(0);
    const pausedScrollRef = useRef(false);
    const firstPositionDoneRef = useRef(false);
    const pendingLineSeekRef = useRef<{
        syncRevision: number;
        targetMs: number;
    } | null>(null);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const [pausedScroll, setPausedScroll] = useState(false);

    const displayState = useMemo(() => {
        if (status === 'loading') return '正在加载歌词...';
        if (status === 'error') return '歌词读取失败';
        if (status === 'empty') return '此歌曲无歌词';
        if (!lines.length) return '暂无歌词';
        return null;
    }, [status, lines.length]);
    const focusNextLineByVisualEnd = timingStrategy?.focusNextLineByVisualEnd ?? false;
    const displayItems = useMemo(
        () => buildDisplayItems(lines, hasTimestamps, timingStrategy),
        [hasTimestamps, lines, timingStrategy]
    );
    const renderBoundaries = useMemo(
        () => buildFluidLyricsRenderBoundaries(displayItems, lines, timingStrategy),
        [displayItems, lines, timingStrategy]
    );
    const getRenderKey = useCallback(
        (currentMs: number) => getFluidLyricsRenderKey(renderBoundaries, currentMs),
        [renderBoundaries]
    );
    const { renderCurrentMs, preciseMsRef, syncRevision } = usePrecisePlaybackTime(
        currentTime,
        getRenderKey,
        true,
    );
    const activeDisplayIndex = useMemo(
        () => getActiveDisplayIndex(displayItems, lines, 0, renderCurrentMs / 1000, timingStrategy),
        [displayItems, lines, renderCurrentMs, timingStrategy]
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
            if (item.type !== 'interlude') return;
            if (!openInterludeIndices.has(displayIndex)) shift -= rowHeight;
        });

        openInterludeIndices.forEach(interludeIndex => {
            for (let displayIndex = 0; displayIndex < displayItems.length; displayIndex++) {
                if (displayIndex < interludeIndex) shifts[displayIndex] -= neighborShift;
                else if (displayIndex > interludeIndex) shifts[displayIndex] += neighborShift;
            }
        });
        return shifts;
    }, [displayItems, exitingInterludeIndex, openInterludeIndex]);
    const activeItem = displayItems[activeDisplayIndex];
    const {
        activeTargetScrollY,
        contentHeight,
        itemTops,
        observeItem,
        scrollAreaRef,
        setTargetScrollY,
        targetScrollY,
        visibleIndices,
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

    const updateTargetScrollY = useCallback((value: number, retainPrevious = true) => {
        const nextTarget = setTargetScrollY(value, retainPrevious);
        previousTargetYRef.current = nextTarget;
    }, [setTargetScrollY]);

    useEffect(() => {
        firstPositionDoneRef.current = false;
        pausedScrollRef.current = false;
        previousTargetYRef.current = 0;
        pendingLineSeekRef.current = null;
        const frame = requestAnimationFrame(() => {
            setPausedScroll(false);
            setIsUserScrolling(false);
            updateTargetScrollY(0, false);
        });
        return () => cancelAnimationFrame(frame);
    }, [isOpen, lines, updateTargetScrollY]);

    useEffect(() => {
        if (!isPlaying) return;
        pausedScrollRef.current = false;
        const frame = requestAnimationFrame(() => setPausedScroll(false));
        return () => cancelAnimationFrame(frame);
    }, [isPlaying]);

    useEffect(() => {
        if (!isOpen || displayState || isUserScrolling) return;
        if (!isPlaying && firstPositionDoneRef.current) return;
        const frame = requestAnimationFrame(() => {
            updateTargetScrollY(activeTargetScrollY);
            firstPositionDoneRef.current = true;
        });
        return () => cancelAnimationFrame(frame);
    }, [activeTargetScrollY, displayState, isOpen, isPlaying, isUserScrolling, updateTargetScrollY]);

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
            isUserScrolling,
            variant,
        }),
        [activeDisplayIndex, displayItems, focusNextLineByVisualEnd, isPlaying, isUserScrolling, variant]
    );
    const getMotionDelay = useCallback(
        (displayIndex: number) => getFluidLyricsMotionDelay({
            activeDisplayIndex,
            displayItems,
            focusNextLineByVisualEnd,
            isPlaying,
            isUserScrolling,
            variant,
        }, displayIndex),
        [activeDisplayIndex, displayItems, focusNextLineByVisualEnd, isPlaying, isUserScrolling, variant]
    );
    const registerAnimatedRow = useFluidLyricsAnimator({
        activeDisplayIndex,
        getDelay: getMotionDelay,
        modelIdentity: displayItems,
        rowCount: displayItems.length,
        springParams: dynamicSpringParams,
        targetScrollY,
        visualShifts: visualInterludeShifts,
    });

    return (
        <div className="relative h-full w-full rounded-[22px] overflow-hidden">
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
                            const isActive = activeDisplayIndex >= 0 && activeItem === item;
                            const isKaraokeActive = item.type === 'line' && item.line.words?.length
                                ? isActive || (
                                    focusNextLineByVisualEnd &&
                                    typeof item.line.visual_end_ms === 'number' &&
                                    typeof item.line.end_ms === 'number' &&
                                    item.line.visual_end_ms < item.line.end_ms &&
                                    renderCurrentMs >= item.line.visual_end_ms &&
                                    renderCurrentMs < item.line.end_ms
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
                                            distanceFromActive={activeDisplayIndex >= 0 ? Math.abs(activeDisplayIndex - displayIndex) : 0}
                                            interludeShift={interludeShift}
                                            interludeShiftDurationMs={interludeGapOpenDurationMs}
                                            lineEndMs={typeof item.line.end_ms === 'number' ? item.line.end_ms : getLineEndMsByIndex(lines, item.lineIndex)}
                                            nextLineStartMs={item.line.words?.length ? getLineEndMsByIndex(lines, item.lineIndex) : null}
                                            enableTightHandoffTailCompression={timingStrategy?.compressTightHandoffTail ?? false}
                                            currentTime={renderCurrentMs / 1000}
                                            preciseMsRef={preciseMsRef}
                                            onSeek={handleLineSeek}
                                            fluidMotion
                                            motionDelay={getMotionDelay(displayIndex)}
                                            variant={variant}
                                        />
                                    )}
                                </FluidLyricsLayoutItem>
                            );
                        })}
                    </div>
                )}
            </motion.div>
        </div>
    );
}

const areFluidLyricsPanelPropsEqual = (previous: LyricsPanelProps, next: LyricsPanelProps) => (
    previous.isOpen === next.isOpen &&
    previous.lyrics === next.lyrics &&
    previous.status === next.status &&
    previous.hasTimestamps === next.hasTimestamps &&
    previous.onSeek === next.onSeek &&
    previous.onUserScrollDirection === next.onUserScrollDirection &&
    previous.variant === next.variant &&
    previous.timingStrategy === next.timingStrategy
);

// 播放时间由内部精确时钟订阅；父组件的进度刷新不应重新执行歌词布局。
export default memo(FluidLyricsPanel, areFluidLyricsPanelPropsEqual);
