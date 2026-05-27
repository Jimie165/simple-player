import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
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
import { buildDisplayItems, getActiveDisplayIndex, getLineEndMsByIndex } from '@/features/player/lyrics/lyricsDisplay';
import type { DisplayItem, LyricsPanelProps } from '@/features/player/lyrics/types';
import { usePrecisePlaybackTime } from '@/features/player/lyrics/usePrecisePlaybackTime';

const scrollMaskStyle = {
    maskImage:
        'linear-gradient(to bottom, transparent 0px, black 3.5rem, black calc(100% - 40px), transparent 100%)',
    WebkitMaskImage:
        'linear-gradient(to bottom, transparent 0px, black 3.5rem, black calc(100% - 40px), transparent 100%)',
};

const NARROW_LYRICS_FOCUS_ALPHA = 0.15;
const NARROW_LYRICS_END_STOP_OFFSET = 56;

export default function LyricsPanel({
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
    const preciseCurrentMs = usePrecisePlaybackTime(currentTime);
    const currentLyricIndex = useLyricsSync({
        lyrics: lines,
        currentTime,
        enabled: isOpen,
        hasTimestamps,
    });
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
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

            const alpha = variant === 'narrow' ? NARROW_LYRICS_FOCUS_ALPHA : 0.5;
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

    const handleUserInteraction = (direction?: 'up' | 'down', delta?: number) => {
        if (direction) onUserScrollDirection?.(direction, delta);
        setIsUserScrolling(true);
        lastAutoScrollIndexRef.current = null;
        preferSmoothAutoScrollRef.current = true;
        if (!isPlaying) pausedScrollRef.current = true;
        if (userScrollTimeoutRef.current) {
            clearTimeout(userScrollTimeoutRef.current);
        }
        userScrollTimeoutRef.current = setTimeout(() => {
            setIsUserScrolling(false);
            userScrollTimeoutRef.current = null;
        }, manualResumeFollowDelayMs);
    };

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

    const displayItems = useMemo(
        () => buildDisplayItems(lines, hasTimestamps),
        [hasTimestamps, lines]
    );
    const activeDisplayIndex = useMemo(
        () => getActiveDisplayIndex(displayItems, lines, currentLyricIndex, preciseCurrentMs / 1000),
        [currentLyricIndex, displayItems, lines, preciseCurrentMs]
    );

    const getVisualInterludeShift = useCallback(
        (displayIndex: number) => {
            const rowHeight = getInterludeRowHeightPx();

            return displayItems.slice(0, displayIndex).reduce((shift, item) => {
                if (item.type !== 'interlude') return shift;
                const itemIndex = displayItems.indexOf(item);
                const closeAtMs = item.endMs - interludeExitCollapseDelayMs;
                const isOpen =
                    itemIndex === exitingInterludeIndex ||
                    (preciseCurrentMs >= item.startMs && preciseCurrentMs < closeAtMs);
                return isOpen ? shift : shift - rowHeight;
            }, 0);
        },
        [displayItems, exitingInterludeIndex, preciseCurrentMs]
    );

    const startInterludeExit = useCallback((displayIndex: number) => {
        if (displayItems[displayIndex]?.type !== 'interlude') return;

        if (interludeExitTimeoutRef.current) {
            clearTimeout(interludeExitTimeoutRef.current);
        }

        setExitingInterludeIndex(displayIndex);
        setInterludeExitKey(key => key + 1);
        interludeExitTimeoutRef.current = window.setTimeout(() => {
            setExitingInterludeIndex(null);
            interludeExitTimeoutRef.current = null;
        }, interludeExitCollapseDelayMs);
    }, [displayItems]);

    const keepCurrentInterludeForExit = useCallback(() => {
        const activeItem = displayItems[activeDisplayIndex];
        if (activeItem?.type !== 'interlude') return;
        if (preciseCurrentMs < activeItem.startMs + interludeGapOpenDurationMs) return;

        startInterludeExit(activeDisplayIndex);
    }, [activeDisplayIndex, displayItems, preciseCurrentMs, startInterludeExit]);

    useEffect(() => {
        const previousMs = previousPlaybackMsRef.current;
        const currentMs = currentTime * 1000;
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
    }, [currentTime, displayItems, startInterludeExit]);

    const getAutoScrollOffset = useCallback(
        (displayIndex: number) => {
            const item = displayItems[displayIndex];
            const visualShift = getVisualInterludeShift(displayIndex);
            const interludeFocusOffset = item?.type === 'interlude' ? getInterludeFocusOffsetPx() : 0;

            const baseOffset = Math.round(visualShift + interludeFocusOffset);
            if (variant === 'narrow' && viewportSizeRef.current) {
                const alpha = NARROW_LYRICS_FOCUS_ALPHA;
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
            virtuosoRef.current?.scrollToIndex({
                index: activeDisplayIndex,
                align: 'center',
                offset: getAutoScrollOffset(activeDisplayIndex),
                behavior:
                    firstScrollDoneRef.current || preferSmoothAutoScrollRef.current
                        ? 'smooth'
                        : 'auto',
            });
            firstScrollDoneRef.current = true;
            lastAutoScrollIndexRef.current = activeDisplayIndex;
            preferSmoothAutoScrollRef.current = false;
        };

        const raf = requestAnimationFrame(scroll);
        return () => cancelAnimationFrame(raf);
    }, [activeDisplayIndex, displayItems, getAutoScrollOffset, isOpen, hasTimestamps, lines.length, isUserScrolling, isPlaying, layoutVersion, recenterVersion]);

    return (
        <div className="relative h-full w-full rounded-[22px] overflow-hidden">
            <div
                ref={scrollAreaRef}
                className={clsx(
                    'relative z-10 mt-0',
                    variant === 'narrow'
                        ? 'h-full mb-0'
                        : 'h-[calc(100%-3.5rem)] mb-[1.5rem]'
                )}
                style={scrollMaskStyle}
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
                        className="h-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                        data={displayItems}
                        components={{ Header, Footer }}
                        initialTopMostItemIndex={{
                            index: activeDisplayIndex,
                            align: 'center',
                            offset: 0,
                        }}
                        defaultItemHeight={90}
                        increaseViewportBy={{ top: 520, bottom: 520 }}
                        itemContent={(displayIndex, item) => {
                            const interludeShift = getVisualInterludeShift(displayIndex);
                            const isActive = activeDisplayIndex >= 0 && displayItems[activeDisplayIndex] === item;

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
                                            currentMs={preciseCurrentMs}
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
                                    isUserScrolling={isUserScrolling}
                                    pausedScroll={pausedScrollRef.current}
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
                                    currentTime={preciseCurrentMs / 1000}
                                    onSeek={(time) => {
                                        keepCurrentInterludeForExit();
                                        onSeek(time);
                                    }}
                                    variant={variant}
                                />
                            );
                        }}
                    />
                )}
            </div>
        </div>
    );
}
