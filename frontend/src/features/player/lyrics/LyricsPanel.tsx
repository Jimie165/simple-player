import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { LyricsLine, LyricsWord } from '@/types';
import { useLyricsSync } from '@/hooks/useLyricsSync';

interface LyricsPanelProps {
    isOpen: boolean;
    lyrics: LyricsLine[] | null;
    status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    hasTimestamps: boolean;
    currentTime: number;
    onSeek: (time: number) => void;
}

type DisplayItem =
    | { type: 'line'; line: LyricsLine; lineIndex: number }
    | { type: 'interlude'; afterLineIndex: number; startMs: number; endMs: number };

import { usePlayerStore } from '@/store/usePlayerStore';

/**
 * Apple Music-style word-by-word highlight. Each word is rendered as a
 * span whose foreground is a horizontal gradient. Uses requestAnimationFrame
 * for 60fps smooth wiping, detached from the 500ms React state updates.
 */
function KaraokeText({
    words,
    lineEndMs,
    currentMs: baseCurrentMs,
}: {
    words: LyricsWord[];
    lineEndMs: number | null;
    currentMs: number;
}) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const [currentMs, setCurrentMs] = useState(baseCurrentMs);
    const lastTick = useRef(performance.now());
    const lastBaseMs = useRef(baseCurrentMs);

    useEffect(() => {
        // Handle external time updates (seek, or the 500ms sync)
        setCurrentMs(prevMs => {
            if (Math.abs(baseCurrentMs - prevMs) > 1000) {
                // Seeked
                return baseCurrentMs;
            } else if (Math.abs(baseCurrentMs - prevMs) > 200) {
                // Gently correct drift
                return prevMs + (baseCurrentMs - prevMs) * 0.5;
            }
            return prevMs;
        });
        lastBaseMs.current = baseCurrentMs;
    }, [baseCurrentMs]);

    useEffect(() => {
        if (!isPlaying) return;
        let frame: number;
        const tick = (now: number) => {
            const delta = now - lastTick.current;
            lastTick.current = now;
            setCurrentMs(prev => prev + delta);
            frame = requestAnimationFrame(tick);
        };
        // Reset tick on start
        lastTick.current = performance.now();
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [isPlaying]);

    return (
        <>
            {words.map((word, i) => {
                const nextStart =
                    i + 1 < words.length ? words[i + 1].time_ms : lineEndMs ?? word.time_ms + 600;
                const dur = Math.max(80, nextStart - word.time_ms);
                const raw = (currentMs - word.time_ms) / dur;
                const progress = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
                
                // Add a very small transition zone for a slightly softer edge, 
                // typical of Apple Music's high quality rendering.
                const stopVal = progress * 100;
                const softEdgeStart = Math.max(0, stopVal - 1);

                // Add an organic "float up" (上浮) and scale effect tied to the vocal progress
                const bounce = Math.sin(progress * Math.PI);
                const translateY = bounce * -0.15; // em
                const scale = 1 + bounce * 0.05;

                return (
                    <span
                        key={i}
                        style={{
                            backgroundImage: `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${softEdgeStart}%, rgba(255,255,255,0.3) ${stopVal}%, rgba(255,255,255,0.3) 100%)`,
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            color: 'transparent',
                            whiteSpace: 'pre-wrap',
                            // The transform is updated 60fps, so no CSS transition is needed
                            transform: `translateY(${translateY}em) scale(${scale})`,
                            display: 'inline-block',
                            willChange: 'transform',
                        }}
                    >
                        {word.text}
                    </span>
                );
            })}
        </>
    );
}

export default function LyricsPanel({
    isOpen,
    lyrics,
    status,
    hasTimestamps,
    currentTime,
    onSeek,
}: LyricsPanelProps) {
    const topInset = 12;
    // Minimum duration between an explicit "previous line ended" marker
    // (an empty `[mm:ss.xx]` line in the LRC) and the next sung line for
    // the interlude dots to appear. Below this, the brief silence is too
    // short to bother animating dots — the previous line just stays
    // highlighted until the next one arrives.
    const interludeThresholdMs = 2000;
    const lines = lyrics ?? [];
    const currentLyricIndex = useLyricsSync({
        lyrics: lines,
        currentTime,
        enabled: isOpen,
        hasTimestamps,
    });
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);

    // Measure scrollable area so the bottom spacer can be half its height.
    // Without it Virtuoso's center alignment can't pull the last few lines
    // into the middle; there's nothing below them to scroll past. The
    // spacer is hidden by the bottom edge of scrollMaskStyle so it never
    // shows as a visible empty row.
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const [spacerHeight, setSpacerHeight] = useState(0);

    useEffect(() => {
        const el = scrollAreaRef.current;
        if (!el) return;
        const update = () => setSpacerHeight(el.clientHeight / 2);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const Header = useCallback(
        () => <div style={{ height: spacerHeight + topInset }} aria-hidden />,
        [spacerHeight, topInset]
    );
    const Footer = useCallback(
        () => <div style={{ height: spacerHeight }} aria-hidden />,
        [spacerHeight]
    );

    const scrollMaskStyle = useMemo(
        () => ({
            maskImage:
                'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
            WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
        }),
        []
    );

    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const userScrollTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    // First scroll-to-current is deferred a frame so Virtuoso has measured
    // its initial visible window. Without this delay smooth scrolling on a
    // variable-height list overshoots the target before settling back.
    const firstScrollDoneRef = useRef(false);
    const lastAutoScrollIndexRef = useRef<number | null>(null);

    const handleUserInteraction = () => {
        setIsUserScrolling(true);
        if (userScrollTimeoutRef.current) {
            clearTimeout(userScrollTimeoutRef.current);
        }
        userScrollTimeoutRef.current = setTimeout(() => {
            setIsUserScrolling(false);
            userScrollTimeoutRef.current = null;
        }, 2000); // 停止操作2秒后恢复跟随
    };

    useEffect(() => {
        return () => {
            if (userScrollTimeoutRef.current) {
                clearTimeout(userScrollTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        firstScrollDoneRef.current = false;
        lastAutoScrollIndexRef.current = null;
    }, [isOpen, lines]);

    const displayState = useMemo(() => {
        if (status === 'loading') return '正在加载歌词...';
        if (status === 'error') return '歌词读取失败';
        if (status === 'empty') return '此歌曲无歌词';
        if (!lines.length) return '暂无歌词';
        return null;
    }, [status, lines.length]);

    const lineEndMsByIndex = useCallback(
        (lineIndex: number): number | null => {
            for (let j = lineIndex + 1; j < lines.length; j++) {
                const ms = lines[j].time_ms;
                if (typeof ms === 'number') return ms;
            }
            return null;
        },
        [lines]
    );

    const displayItems = useMemo<DisplayItem[]>(() => {
        const items: DisplayItem[] = [];
        // Track the most recent non-empty timed line so an empty marker
        // can be attributed back to it (the line whose "last word" just
        // ended). lastLyricLineIndex is the index in `lines`, not in
        // `items`.
        // pendingEndMs is the explicit "previous lyric stops sounding"
        // moment, sourced (in priority order) from:
        //   1. the previous line's word-level end (line.end_ms — the
        //      trailing <mm:ss.xx> in enhanced LRC), set right after we
        //      push the line.
        //   2. an empty `[mm:ss.xx]` marker line, set when we encounter it.
        // The earliest non-null source wins; we don't overwrite a word-end
        // with a later marker because the word-end is more precise.
        let lastLyricLineIndex = -1;
        let pendingEndMs: number | null = null;

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];

            // Empty timed line == explicit interlude / "previous line ended"
            // marker. Don't render it as its own row; remember its time so
            // we can pair it with the next sung line.
            if (
                hasTimestamps &&
                typeof line.time_ms === 'number' &&
                line.text.length === 0
            ) {
                if (pendingEndMs === null) pendingEndMs = line.time_ms;
                continue;
            }

            items.push({ type: 'line', line, lineIndex: index });

            if (
                hasTimestamps &&
                typeof line.time_ms === 'number' &&
                pendingEndMs !== null &&
                lastLyricLineIndex >= 0
            ) {
                const gapMs = line.time_ms - pendingEndMs;
                if (gapMs >= interludeThresholdMs) {
                    // Splice the interlude in front of the line we just
                    // pushed, so it sits between the previous lyric and the
                    // upcoming one in display order.
                    items.splice(items.length - 1, 0, {
                        type: 'interlude',
                        afterLineIndex: lastLyricLineIndex,
                        startMs: pendingEndMs,
                        endMs: line.time_ms,
                    });
                }
            }

            // Prime pendingEndMs from the just-pushed line's word-level end
            // (if any). An explicit empty marker after this line will only
            // overwrite when end_ms is missing (see `pendingEndMs === null`
            // guard above).
            pendingEndMs = typeof line.end_ms === 'number' ? line.end_ms : null;
            if (typeof line.time_ms === 'number') lastLyricLineIndex = index;
        }

        return items;
    }, [hasTimestamps, lines, interludeThresholdMs]);

    const activeDisplayIndex = useMemo(() => {
        if (!displayItems.length) return 0;

        const currentLine = lines[currentLyricIndex];
        const currentMs = currentTime * 1000;

        if (currentLine && typeof currentLine.time_ms === 'number') {
            // No buffer needed here: startMs is the explicit "previous line
            // ended" marker from the LRC, so as soon as playback crosses it
            // the dots are the correct active item.
            const interludeIndex = displayItems.findIndex((item) =>
                item.type === 'interlude' &&
                item.afterLineIndex === currentLyricIndex &&
                currentMs >= item.startMs &&
                currentMs < item.endMs
            );

            if (interludeIndex >= 0) return interludeIndex;
        }

        const lineDisplayIndex = displayItems.findIndex((item) =>
            item.type === 'line' && item.lineIndex === currentLyricIndex
        );

        return lineDisplayIndex >= 0 ? lineDisplayIndex : 0;
    }, [currentLyricIndex, currentTime, displayItems, lines]);

    useEffect(() => {
        if (!isOpen || !hasTimestamps || lines.length === 0) return;
        if (isUserScrolling) return;
        if (lastAutoScrollIndexRef.current === activeDisplayIndex) return;

        const scroll = () => {
            virtuosoRef.current?.scrollToIndex({
                index: activeDisplayIndex,
                align: 'center',
                behavior: firstScrollDoneRef.current ? 'smooth' : 'auto',
            });
            firstScrollDoneRef.current = true;
            lastAutoScrollIndexRef.current = activeDisplayIndex;
        };
        const raf = requestAnimationFrame(scroll);
        return () => cancelAnimationFrame(raf);
    }, [activeDisplayIndex, isOpen, hasTimestamps, lines.length, isUserScrolling]);

    return (
        <div className="relative h-full w-full rounded-[22px] overflow-hidden">



            <div
                ref={scrollAreaRef}
                className="relative z-10 h-[calc(100%-5rem)] mt-[1.5rem] mb-[1.5rem]"
                style={scrollMaskStyle}
                onWheel={handleUserInteraction}
                onTouchMove={handleUserInteraction}
                onPointerDown={() => {
                    // 只拦截鼠标左键点击拖拽滚动条，或触屏按下的意图
                    handleUserInteraction();
                }}
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
                        initialTopMostItemIndex={{ index: activeDisplayIndex, align: 'center' }}
                        defaultItemHeight={90}
                        itemContent={(_, item) => {
                            if (item.type === 'interlude') {
                                const isActive = activeDisplayIndex >= 0 && displayItems[activeDisplayIndex] === item;
                                const progress = Math.max(
                                    0,
                                    Math.min(1, ((currentTime * 1000) - item.startMs) / (item.endMs - item.startMs))
                                );
                                const dotOpacities = [0, 1, 2].map((dotIndex) => {
                                    const phaseStart = dotIndex / 3;
                                    const normalized = Math.max(0, Math.min(1, (progress - phaseStart) * 3));
                                    return 0.24 + normalized * 0.76;
                                });

                                return (
                                    <div
                                        className={clsx(
                                            'overflow-hidden px-[clamp(1.2rem,2.2vw,2rem)] transition-all duration-[600ms] ease-[0.25,1,0.5,1]',
                                            isActive
                                                ? 'h-[var(--interlude-height,3.5rem)] opacity-100 scale-100'
                                                : 'h-0 opacity-0 scale-[0.8] pointer-events-none'
                                        )}
                                        aria-hidden={!isActive}
                                    >
                                        <span className="flex items-center gap-[0.45rem] h-full" aria-hidden>
                                            {dotOpacities.map((opacity, dotIndex) => (
                                                <span
                                                    key={dotIndex}
                                                    className="h-[0.7rem] w-[0.7rem] rounded-full bg-white transition-opacity duration-300"
                                                    style={{ opacity }}
                                                />
                                            ))}
                                        </span>
                                    </div>
                                );
                            }

                            const { line } = item;
                            const isActive = activeDisplayIndex >= 0 && displayItems[activeDisplayIndex] === item;
                            const canSeek = line.time_ms !== null;

                            return (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!canSeek) return;
                                        onSeek(line.time_ms! / 1000);
                                    }}
                                    disabled={!canSeek}
                                    className={clsx(
                                        'w-full text-left px-[clamp(1.2rem,2.2vw,2rem)] py-[clamp(0.6rem,1vw,1rem)] transition-all duration-300 origin-left',
                                        canSeek ? 'cursor-pointer' : 'cursor-default',
                                        isActive
                                            ? 'text-white scale-100 opacity-100 drop-shadow-xl'
                                            : 'text-white scale-[0.9] blur-[0.5px] opacity-40 hover:opacity-75 hover:blur-none hover:scale-[0.92]'
                                    )}
                                >
                                    <span className="block font-bold text-[clamp(1.15rem,3.2vmin,2.2rem)] leading-[1.4] tracking-wide relative">
                                        {isActive && line.words && line.words.length > 0 ? (
                                            <KaraokeText
                                                words={line.words}
                                                lineEndMs={
                                                    typeof line.end_ms === 'number'
                                                        ? line.end_ms
                                                        : lineEndMsByIndex(item.lineIndex)
                                                }
                                                currentMs={currentTime * 1000}
                                            />
                                        ) : (
                                            line.text
                                        )}
                                    </span>
                                    {line.translation && (
                                        <span className="block font-medium text-[clamp(0.9rem,2.4vmin,1.6rem)] leading-[1.35] tracking-wide opacity-90 mt-1">
                                            {line.translation}
                                        </span>
                                    )}
                                </button>
                            );
                        }}
                    />
                )}
            </div>
        </div>
    );
}
