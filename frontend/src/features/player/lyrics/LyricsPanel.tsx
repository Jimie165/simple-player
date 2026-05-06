import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { motion } from 'framer-motion';
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
    
    // 如果组件较晚挂载（例如由于外部 500ms 刷新率导致的延迟），
    // 强制它从这句话第一个字的略微提前的时间开始，以便给用户展示一个顺滑的“快速追赶（swoosh）”动画，
    // 而不是直接让前几个字突兀地变白。
    const [currentMs, setCurrentMs] = useState(() => {
        if (words.length > 0) {
            const firstWordStart = words[0].time_ms;
            // 如果实际时间已经超过了第一个字，我们从第一个字前 50ms 处起步，触发追赶特效
            if (baseCurrentMs > firstWordStart) {
                // 如果落后太多（超过 3 秒），说明可能是跳转，不要从头追赶
                if (baseCurrentMs - firstWordStart > 3000) {
                    return baseCurrentMs;
                }
                return firstWordStart - 50;
            }
        }
        return baseCurrentMs;
    });

    const targetMsRef = useRef(baseCurrentMs);
    const lastTick = useRef(0);

    useEffect(() => {
        setCurrentMs(prevMs => {
            if (Math.abs(baseCurrentMs - prevMs) > 3000) {
                // 如果差距极大（比如用户手动拉动了进度条），直接跳转，不进行平滑追赶
                return baseCurrentMs;
            }
            return prevMs;
        });
        targetMsRef.current = baseCurrentMs;
    }, [baseCurrentMs]);

    useEffect(() => {
        if (!isPlaying) return;
        let frame: number;
        
        const tick = (now: number) => {
            if (!lastTick.current) lastTick.current = now;
            const delta = now - lastTick.current;
            lastTick.current = now;

            setCurrentMs(prev => {
                let nextMs = prev + delta;
                
                // 向外部真实时间（targetMsRef.current）进行平滑追赶修正
                const diff = targetMsRef.current - nextMs;
                if (diff > 50) {
                    // 我们落后了（比如组件刚挂载，或者系统更新有延迟），加速追赶
                    // 每一帧追赶剩余差距的 15%，大约 10 帧（不到 0.2 秒）就能平滑填补前几个字的空白
                    nextMs += diff * 0.15;
                }
                
                return nextMs;
            });
            frame = requestAnimationFrame(tick);
        };
        
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

function InterludeItem({ 
    isActive: isCurrentlyActive,
    currentTime,
    startMs,
    endMs
}: { 
    isActive: boolean;
    currentTime: number;
    startMs: number;
    endMs: number;
}) {
    const isFirstMount = useRef(true);
    
    useEffect(() => {
        isFirstMount.current = false;
    }, []);

    const isPlaying = usePlayerStore(state => state.isPlaying);
    const [preciseMs, setPreciseMs] = useState(currentTime * 1000);
    const lastTick = useRef(0);

    // 同步外部时间更新（如拖动进度条）
    useEffect(() => {
        setPreciseMs(prev => {
            const external = currentTime * 1000;
            if (Math.abs(external - prev) > 200) return external;
            return prev;
        });
    }, [currentTime]);

    // 高精度时间循环，确保动画平滑且可暂停续播
    useEffect(() => {
        if (!isPlaying) return;
        let frame: number;
        const tick = (now: number) => {
            const delta = now - lastTick.current;
            lastTick.current = now;
            setPreciseMs(prev => prev + delta);
            frame = requestAnimationFrame(tick);
        };
        lastTick.current = performance.now();
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [isPlaying]);

    // 距离间奏结束剩余的毫秒数
    const remainingMs = endMs - preciseMs;
    // 强制在剩余 1000ms 时触发离场动画（放大阶段），而外部聚焦会在 600ms 时切换（缩小阶段）
    const isActuallyActive = isCurrentlyActive && remainingMs > 1000;

    const progress = Math.max(
        0,
        Math.min(1, (preciseMs - startMs) / (endMs - startMs))
    );

    const dotOpacities = [0, 1, 2].map((dotIndex) => {
        const phaseStart = dotIndex / 3;
        const normalized = Math.max(0, Math.min(1, (progress - phaseStart) * 3));
        return 0.24 + normalized * 0.76;
    });

    // 计算高精度呼吸缩放：4.5s 一个周期，范围 0.85-1.05
    const BREATH_DURATION = 4500;
    const cycleProgress = (preciseMs % BREATH_DURATION) / BREATH_DURATION;
    const currentScale = 0.95 + 0.1 * Math.sin(cycleProgress * 2 * Math.PI - Math.PI / 2);

    // 离场动画参数
    const EXIT_DURATION = 0.8;
    const EXIT_PEAK_RATIO = 0.4; // 在 40% 的时间点达到最大缩放

    return (
        <motion.div
            className="px-[clamp(1.2rem,2.2vw,2rem)] flex items-center overflow-hidden"
            aria-hidden={!isActuallyActive}
            initial={{ height: 0 }}
            animate={{ 
                height: isActuallyActive ? 'clamp(2.5rem,6vmin,4rem)' : 0 
            }}
            transition={isActuallyActive ? {
                duration: 0.6,
                ease: [0.25, 1, 0.5, 1]
            } : {
                // 只有在缩小时（达到峰值后）才开始收缩高度
                delay: EXIT_DURATION * EXIT_PEAK_RATIO,
                duration: EXIT_DURATION * (1 - EXIT_PEAK_RATIO),
                ease: "easeIn"
            }}
        >
            <motion.span 
                className="flex items-center gap-[clamp(0.28rem,0.9vmin,0.56rem)] origin-left" 
                aria-hidden
                initial={{ scale: 0 }}
                animate={isActuallyActive ? {
                    scale: currentScale
                } : {
                    scale: isFirstMount.current ? 0 : [null, 1.15, 0]
                }}
                transition={isActuallyActive ? {
                    duration: 0.05,
                    ease: "linear"
                } : {
                    duration: EXIT_DURATION,
                    ease: "easeInOut",
                    times: [0, EXIT_PEAK_RATIO, 1]
                }}
            >
                {[0, 1, 2].map((dotIndex) => (
                    <motion.span
                        key={dotIndex}
                        className="rounded-full bg-white"
                        style={{
                            width: 'clamp(0.48rem, 1.42vmin, 0.97rem)',
                            height: 'clamp(0.48rem, 1.42vmin, 0.97rem)',
                        }}
                        initial={{ opacity: 0 }}
                        animate={isActuallyActive ? {
                            opacity: dotOpacities[dotIndex]
                        } : {
                            opacity: isFirstMount.current ? 0 : [null, 1, 0]
                        }}
                        transition={isActuallyActive ? {
                            duration: 0.05, ease: "linear" 
                        } : {
                            duration: EXIT_DURATION,
                            ease: "easeInOut",
                            times: [0, EXIT_PEAK_RATIO, 1]
                        }}
                    />
                ))}
            </motion.span>
        </motion.div>
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
    const manualResumeFollowDelayMs = 2000;
    // Minimum duration between an explicit "previous line ended" marker
    // (an empty `[mm:ss.xx]` line in the LRC) and the next sung line for
    // the interlude dots to appear. Below this, the brief silence is too
    // short to bother animating dots — the previous line just stays
    // highlighted until the next one arrives.
    const interludeThresholdMs = 5000;
    const lines = useMemo(() => lyrics ?? [], [lyrics]);
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
    const viewportSizeRef = useRef<{ width: number; height: number } | null>(null);
    const [layoutVersion, setLayoutVersion] = useState(0);
    const [recenterVersion, setRecenterVersion] = useState(0);
    const firstScrollDoneRef = useRef(false);
    const lastAutoScrollIndexRef = useRef<number | null>(null);
    const preferSmoothAutoScrollRef = useRef(false);

    useEffect(() => {
        const el = scrollAreaRef.current;
        if (!el) return;
        const update = () => {
            const width = el.clientWidth;
            const height = el.clientHeight;
            const prevSize = viewportSizeRef.current;

            setSpacerHeight(height / 2);

            if (prevSize && (prevSize.width !== width || prevSize.height !== height)) {
                setLayoutVersion(version => version + 1);
            }

            viewportSizeRef.current = { width, height };
        };
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

    const handleUserInteraction = () => {
        setIsUserScrolling(true);
        // Once the user scrolls away, allow the next "resume following"
        // moment to snap the current line back into view even if the active
        // lyric index hasn't changed yet.
        lastAutoScrollIndexRef.current = null;
        preferSmoothAutoScrollRef.current = true;
        if (userScrollTimeoutRef.current) {
            clearTimeout(userScrollTimeoutRef.current);
        }
        userScrollTimeoutRef.current = setTimeout(() => {
            setIsUserScrolling(false);
            userScrollTimeoutRef.current = null;
        }, manualResumeFollowDelayMs); // 手动滚动后给用户更充裕的浏览时间
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
        preferSmoothAutoScrollRef.current = false;
    }, [isOpen, lines]);

    useEffect(() => {
        if (!isOpen || !hasTimestamps || lines.length === 0) return;

        const timeout = window.setTimeout(() => {
            // A light second-pass recenter fixes the case where Virtuoso's
            // first positioning lands the active row merely "visible" during
            // initial measurement, but not truly centered yet.
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

            if (
                hasTimestamps &&
                typeof line.time_ms === 'number' &&
                lastLyricLineIndex < 0 &&
                line.time_ms >= interludeThresholdMs
            ) {
                items.push({
                    type: 'interlude',
                    afterLineIndex: -1,
                    startMs: 0,
                    endMs: line.time_ms,
                });
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

        const currentMs = currentTime * 1000;
        const leadingInterludeIndex = displayItems.findIndex((item) =>
            item.type === 'interlude' &&
            item.afterLineIndex === -1 &&
            currentMs >= item.startMs &&
            currentMs < item.endMs
        );

        if (leadingInterludeIndex >= 0) {
            const item = displayItems[leadingInterludeIndex] as { type: 'interlude'; endMs: number };
            if (currentMs >= item.endMs - 600) {
                return Math.min(displayItems.length - 1, leadingInterludeIndex + 1);
            }
            return leadingInterludeIndex;
        }

        const currentLine = lines[currentLyricIndex];

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

            if (interludeIndex >= 0) {
                const item = displayItems[interludeIndex] as { type: 'interlude'; endMs: number };
                // 如果间奏即将结束（剩余 600ms），即点点开始从峰值缩小时，提前聚焦到下一行
                if (currentMs >= item.endMs - 600) {
                    return Math.min(displayItems.length - 1, interludeIndex + 1);
                }
                return interludeIndex;
            }

            if (typeof currentLine.end_ms === 'number' && currentMs >= currentLine.end_ms) {
                const currentDisplayIndex = displayItems.findIndex((item) =>
                    item.type === 'line' && item.lineIndex === currentLyricIndex
                );
                const nextDisplayItem =
                    currentDisplayIndex >= 0 ? displayItems[currentDisplayIndex + 1] : null;
                if (nextDisplayItem?.type === 'line') return currentDisplayIndex + 1;
            }
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
    }, [activeDisplayIndex, isOpen, hasTimestamps, lines.length, isUserScrolling, layoutVersion, recenterVersion]);

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
                                return (
                                    <InterludeItem 
                                        isActive={isActive} 
                                        currentTime={currentTime}
                                        startMs={item.startMs}
                                        endMs={item.endMs}
                                    />
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
                                    <span className="block font-bold text-[clamp(1.22rem,3.4vmin,2.35rem)] leading-[1.4] tracking-wide relative">
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
                                        <span className="block font-medium text-[clamp(0.9rem,2.4vmin,1.62rem)] leading-[1.35] tracking-wide opacity-90 mt-1">
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
