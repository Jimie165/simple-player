import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import clsx from 'clsx';
import { motion, type PanInfo } from 'framer-motion';
import { useLyricsSync } from '@/hooks/useLyricsSync';
import { usePlayerStore } from '@/store/usePlayerStore';
import {
    interludeExitCollapseDelayMs,
    interludeGapOpenDurationMs,
    interludeNextLineFocusLeadMs,
    manualResumeFollowDelayMs,
    topInsetPx,
} from '@/features/player/lyrics/constants';
import InterludeItem from '@/features/player/lyrics/InterludeItem';
import { getInterludeFocusOffsetPx, getInterludeRowHeightPx } from '@/features/player/lyrics/layoutMetrics';
import LyricsLineItem from '@/features/player/lyrics/LyricsLineItem';
import {
    buildDisplayItems,
    getActiveDisplayIndex,
    getLineEndMsByIndex,
} from '@/features/player/lyrics/lyricsDisplay';
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
        'linear-gradient(to bottom, transparent 0px, black clamp(2rem, 5vh, 3.5rem), black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage:
        'linear-gradient(to bottom, transparent 0px, black clamp(2rem, 5vh, 3.5rem), black calc(100% - 40px), transparent 100%)',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const NARROW_LYRICS_FOCUS_ALPHA = 0.15;
const SIDE_LYRICS_FOCUS_ALPHA = 0.45;
const NARROW_LYRICS_END_STOP_OFFSET = 56;

export default function FluidLyricsPanel({
    isOpen,
    lyrics,
    status,
    hasTimestamps,
    currentTime,
    onSeek,
    onUserScrollDirection,
    variant,
}: LyricsPanelProps) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const lines = useMemo(() => lyrics ?? [], [lyrics]);
    const { renderCurrentMs, preciseMsRef } = usePrecisePlaybackTime(currentTime);
    const currentLyricIndex = useLyricsSync({
        lyrics: lines,
        currentTime: renderCurrentMs / 1000,
        enabled: isOpen,
        hasTimestamps,
    });

    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
    const viewportSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
    const contentHeightRef = useRef(0);
    const resumeTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const interludeExitTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const previousPlaybackMsRef = useRef(currentTime * 1000);
    const exitingInterludeIndexRef = useRef<number | null>(null);
    const previousTargetYRef = useRef(0);
    const pausedScrollRef = useRef(false);
    const firstPositionDoneRef = useRef(false);

    const [topSpacerHeight, setTopSpacerHeight] = useState(0);
    const [bottomSpacerHeight, setBottomSpacerHeight] = useState(0);
    const [layoutVersion, setLayoutVersion] = useState(0);
    const [targetScrollY, setTargetScrollY] = useState(0);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const [pausedScroll, setPausedScroll] = useState(false);
    const [exitingInterludeIndex, setExitingInterludeIndex] = useState<number | null>(null);
    const [interludeExitKey, setInterludeExitKey] = useState(0);
    const [playbackSyncKey, setPlaybackSyncKey] = useState(0);

    const displayState = useMemo(() => {
        if (status === 'loading') return '正在加载歌词...';
        if (status === 'error') return '歌词读取失败';
        if (status === 'empty') return '此歌曲无歌词';
        if (!lines.length) return '暂无歌词';
        return null;
    }, [status, lines.length]);

    const displayItems = useMemo(
        () => buildDisplayItems(lines, hasTimestamps),
        [hasTimestamps, lines]
    );
    const activeDisplayIndex = useMemo(
        () => getActiveDisplayIndex(displayItems, lines, currentLyricIndex, renderCurrentMs / 1000),
        [currentLyricIndex, displayItems, lines, renderCurrentMs]
    );

    useEffect(() => {
        exitingInterludeIndexRef.current = exitingInterludeIndex;
    }, [exitingInterludeIndex]);

    const maxScrollY = useCallback(() => {
        const viewportHeight = viewportSizeRef.current.height;
        return Math.max(0, contentHeightRef.current - viewportHeight);
    }, []);

    const getVisualInterludeShift = useCallback(
        (displayIndex: number) => {
            const rowHeight = getInterludeRowHeightPx();

            return displayItems.slice(0, displayIndex).reduce((shift, item, sliceIndex) => {
                if (item.type !== 'interlude') return shift;
                const closeAtMs = item.endMs - interludeNextLineFocusLeadMs;
                const isOpenInterlude =
                    sliceIndex === exitingInterludeIndex ||
                    (renderCurrentMs >= item.startMs && renderCurrentMs < closeAtMs);
                return isOpenInterlude ? shift : shift - rowHeight;
            }, 0);
        },
        [displayItems, exitingInterludeIndex, renderCurrentMs]
    );

    const calculateAutoTargetY = useCallback(() => {
        const viewportHeight = viewportSizeRef.current.height;
        const activeEl = itemRefs.current[activeDisplayIndex];
        if (!activeEl || viewportHeight <= 0) return 0;

        const activeItem = displayItems[activeDisplayIndex];
        const visualShift = getVisualInterludeShift(activeDisplayIndex);
        const interludeFocusOffset = activeItem?.type === 'interlude' ? getInterludeFocusOffsetPx() : 0;
        const itemCenter = activeEl.offsetTop + activeEl.offsetHeight / 2 + visualShift + interludeFocusOffset;

        const alpha = variant === 'narrow' ? NARROW_LYRICS_FOCUS_ALPHA : SIDE_LYRICS_FOCUS_ALPHA;
        return clamp(Math.round(itemCenter - viewportHeight * alpha), 0, maxScrollY());
    }, [activeDisplayIndex, displayItems, getVisualInterludeShift, maxScrollY, variant]);

    const setTargetWithDirection = useCallback((nextTarget: number) => {
        const clamped = clamp(nextTarget, 0, maxScrollY());
        previousTargetYRef.current = clamped;
        setTargetScrollY(clamped);
    }, [maxScrollY]);

    useEffect(() => {
        const el = scrollAreaRef.current;
        if (!el) return;

        const update = () => {
            const width = el.clientWidth;
            const height = el.clientHeight;
            const nextContentHeight = contentRef.current?.scrollHeight ?? 0;
            const previous = viewportSizeRef.current;

            viewportSizeRef.current = { width, height };
            contentHeightRef.current = nextContentHeight;

            const alpha = variant === 'narrow' ? NARROW_LYRICS_FOCUS_ALPHA : SIDE_LYRICS_FOCUS_ALPHA;
            setTopSpacerHeight(height * alpha);
            setBottomSpacerHeight(
                variant === 'narrow'
                    ? Math.max(0, height * (1 - alpha) - NARROW_LYRICS_END_STOP_OFFSET)
                    : height * (1 - alpha)
            );

            if (previous.width !== width || previous.height !== height) {
                setLayoutVersion(version => version + 1);
            }
        };

        update();
        const resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(el);
        if (contentRef.current) resizeObserver.observe(contentRef.current);

        return () => resizeObserver.disconnect();
    }, [displayItems, variant]);

    useEffect(() => {
        firstPositionDoneRef.current = false;
        pausedScrollRef.current = false;
        previousTargetYRef.current = 0;

        const frame = requestAnimationFrame(() => {
            setPausedScroll(false);
            setIsUserScrolling(false);
            setTargetScrollY(0);
        });

        return () => cancelAnimationFrame(frame);
    }, [isOpen, lines]);

    useEffect(() => {
        if (isPlaying) {
            pausedScrollRef.current = false;
            const frame = requestAnimationFrame(() => setPausedScroll(false));
            return () => cancelAnimationFrame(frame);
        }
    }, [isPlaying]);

    useEffect(() => {
        if (!isOpen || displayState) return;
        if (isUserScrolling) return;
        if (!isPlaying && firstPositionDoneRef.current) return;

        const raf = requestAnimationFrame(() => {
            setTargetWithDirection(calculateAutoTargetY());
            firstPositionDoneRef.current = true;
        });

        return () => cancelAnimationFrame(raf);
    }, [
        activeDisplayIndex,
        calculateAutoTargetY,
        displayState,
        isOpen,
        isPlaying,
        isUserScrolling,
        layoutVersion,
        renderCurrentMs,
        setTargetWithDirection,
    ]);

    const scheduleResumeFollow = useCallback(() => {
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
        }
        resumeTimeoutRef.current = setTimeout(() => {
            setIsUserScrolling(false);
            if (!isPlaying) {
                pausedScrollRef.current = true;
                setPausedScroll(true);
                return;
            }
            setTargetWithDirection(calculateAutoTargetY());
        }, manualResumeFollowDelayMs);
    }, [calculateAutoTargetY, isPlaying, setTargetWithDirection]);

    const handleManualDelta = useCallback((deltaY: number) => {
        if (deltaY !== 0) onUserScrollDirection?.(deltaY > 0 ? 'down' : 'up', Math.abs(deltaY));
        setIsUserScrolling(true);
        if (!isPlaying) {
            pausedScrollRef.current = true;
            setPausedScroll(true);
        }
        setTargetWithDirection(previousTargetYRef.current + deltaY);
        scheduleResumeFollow();
    }, [isPlaying, onUserScrollDirection, scheduleResumeFollow, setTargetWithDirection]);

    const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        handleManualDelta(event.deltaY);
    }, [handleManualDelta]);

    const handlePan = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        handleManualDelta(-info.delta.y);
    }, [handleManualDelta]);

    useEffect(() => {
        return () => {
            if (resumeTimeoutRef.current) {
                clearTimeout(resumeTimeoutRef.current);
            }
            if (interludeExitTimeoutRef.current) {
                clearTimeout(interludeExitTimeoutRef.current);
            }
        };
    }, []);

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

    const dynamicSpringParams = useMemo(() => {
        if (!isPlaying || isUserScrolling || activeDisplayIndex <= 0 || activeDisplayIndex >= displayItems.length) {
            return { type: 'spring', stiffness: 90, damping: 15, mass: 1 } as const;
        }

        const currentItem = displayItems[activeDisplayIndex];
        const prevItem = displayItems[activeDisplayIndex - 1];
        const currentStartMs = currentItem.type === 'line' ? (currentItem.line.time_ms ?? 0) : currentItem.startMs;
        const prevStartMs = prevItem.type === 'line' ? (prevItem.line.time_ms ?? 0) : prevItem.startMs;

        const interval = currentStartMs - prevStartMs;
        const MIN_INTERVAL = 100;
        const MAX_INTERVAL = 800;
        const clampedInterval = clamp(interval, MIN_INTERVAL, MAX_INTERVAL);
        const MAX_STIFFNESS = 220;
        const MIN_STIFFNESS = 170;

        let ratio = 1 - (clampedInterval - MIN_INTERVAL) / (MAX_INTERVAL - MIN_INTERVAL);
        ratio = Math.pow(ratio, 0.2);

        const targetStiffness = MIN_STIFFNESS + ratio * (MAX_STIFFNESS - MIN_STIFFNESS);
        const targetDamping = Math.sqrt(targetStiffness) * 2.2;

        return { type: 'spring', stiffness: targetStiffness, damping: targetDamping, mass: 1 } as const;
    }, [activeDisplayIndex, displayItems, isPlaying, isUserScrolling]);

    const motionDelays = useMemo(() => {
        const delays = new Array(displayItems.length).fill(0);
        if (isUserScrolling || !isPlaying || activeDisplayIndex < 0) return delays;

        const previousItem = displayItems[activeDisplayIndex - 1];
        const isVisualHandoff =
            previousItem?.type === 'line' &&
            typeof previousItem.line.visual_end_ms === 'number' &&
            (typeof previousItem.line.end_ms !== 'number' || previousItem.line.visual_end_ms < previousItem.line.end_ms);

        // AMLL 是从实际进入可见区域后的 group 开始累计 delay。
        // 普通换行保留较完整的牵拉；visual_end_ms 触发的紧贴换行则缩短 active 行等待，
        // 避免“已经提前聚焦，但滚动还没启动”的小错位。
        const visibleRowsAboveFocus = isVisualHandoff
            ? 2
            : (variant === 'narrow' ? 3 : 4);
        const topVisibleIndex = Math.max(0, activeDisplayIndex - visibleRowsAboveFocus);

        const isFromInterlude = previousItem?.type === 'interlude';

        if (isFromInterlude) {
            let currentDelay = 0;
            const baseDelay = 0.05;
            for (let i = 0; i < displayItems.length; i++) {
                if (i <= activeDisplayIndex) {
                    delays[i] = 0;
                } else {
                    currentDelay += baseDelay;
                    delays[i] = currentDelay;
                }
            }
        } else {
            let currentDelay = 0;
            let baseDelay = isVisualHandoff ? 0.055 : 0.05;
            for (let i = topVisibleIndex; i < displayItems.length; i++) {
                delays[i] = currentDelay;
                currentDelay += baseDelay;
                if (i >= activeDisplayIndex) {
                    baseDelay /= 1.05;
                }
            }
        }
        return delays;
    }, [activeDisplayIndex, displayItems, isPlaying, isUserScrolling, variant]);

    return (
        <div className="relative h-full w-full rounded-[22px] overflow-hidden">
            <motion.div
                ref={scrollAreaRef}
                className={clsx(
                    'relative z-10 mt-0 overflow-hidden touch-none',
                    variant === 'narrow'
                        ? 'h-full mb-0'
                        : 'h-[calc(100%-3.5rem)] mb-[1.5rem]'
                )}
                style={variant === 'narrow' ? narrowScrollMaskStyle : sideScrollMaskStyle}
                onPan={handlePan}
                onWheel={handleWheel}
            >
                {displayState ? (
                    <div className="h-full flex items-center justify-center text-white/40 text-sm">
                        {displayState}
                    </div>
                ) : (
                    <div ref={contentRef} className="relative">
                        <div style={{ height: topSpacerHeight + topInsetPx }} aria-hidden />
                        {displayItems.map((item, displayIndex) => {
                            const interludeShift = getVisualInterludeShift(displayIndex);
                            const isActive = activeDisplayIndex >= 0 && displayItems[activeDisplayIndex] === item;

                            return (
                                <div
                                    key={item.type === 'line' ? `line-${item.lineIndex}` : `interlude-${item.afterLineIndex}-${item.startMs}`}
                                    ref={(node) => {
                                        itemRefs.current[displayIndex] = node;
                                    }}
                                >
                                    {item.type === 'interlude' ? (
                                        <motion.div
                                            animate={{ y: interludeShift - targetScrollY }}
                                            transition={{
                                                y: {
                                                    ...dynamicSpringParams,
                                                    delay: motionDelays[displayIndex],
                                                },
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
                                        </motion.div>
                                    ) : (
                                        <LyricsLineItem
                                            line={item.line}
                                            isActive={isActive}
                                            isUserScrolling={isUserScrolling}
                                            pausedScroll={pausedScroll}
                                            distanceFromActive={
                                                activeDisplayIndex >= 0 ? Math.abs(activeDisplayIndex - displayIndex) : 0
                                            }
                                            interludeShift={interludeShift}
                                            interludeShiftDurationMs={interludeGapOpenDurationMs}
                                            lineEndMs={
                                                typeof item.line.end_ms === 'number'
                                                    ? item.line.end_ms
                                                    : getLineEndMsByIndex(lines, item.lineIndex)
                                            }
                                            nextLineStartMs={
                                                item.line.words?.length
                                                    ? getLineEndMsByIndex(lines, item.lineIndex)
                                                    : null
                                            }
                                            currentTime={renderCurrentMs / 1000}
                                            preciseMsRef={preciseMsRef}
                                            onSeek={(time) => {
                                                keepCurrentInterludeForExit();
                                                setIsUserScrolling(false);
                                                onSeek(time);
                                            }}
                                            fluidMotion
                                            targetScrollY={targetScrollY}
                                            motionDelay={motionDelays[displayIndex]}
                                            springParams={dynamicSpringParams}
                                            variant={variant}
                                        />
                                    )}
                                </div>
                            );
                        })}
                        <div style={{ height: bottomSpacerHeight }} aria-hidden />
                    </div>
                )}
            </motion.div>
        </div>
    );
}
