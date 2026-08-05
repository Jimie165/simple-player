import clsx from 'clsx';
import { memo, useEffect, useRef, type RefObject } from 'react';
import type { LyricsLine } from '@/types';
import KaraokeText from '@/features/player/lyrics/KaraokeText';
import { getFluidLyricsRowVisualStyle } from '@/features/player/lyrics/fluidLyricsMotion';

interface LyricsLineItemProps {
    line: LyricsLine;
    isActive: boolean;
    isKaraokeActive?: boolean;
    isUserScrolling: boolean;
    pausedScroll: boolean;
    distanceFromActive: number;
    interludeShift: number;
    interludeShiftDurationMs: number;
    lineEndMs: number | null;
    nextLineStartMs?: number | null;
    enableTightHandoffTailCompression?: boolean;
    currentTime: number;
    preciseMsRef: RefObject<number>;
    onSeek: (time: number) => void;
    fluidMotion?: boolean;
    motionDelay?: number;
    variant?: 'side' | 'narrow';
    isBackground?: boolean;
    hasDuetLine?: boolean;
    onBackgroundHeight?: (height: number) => void;
}

let lyricsViewportObserver: IntersectionObserver | null = null;

const getLyricsViewportObserver = () => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return null;

    lyricsViewportObserver ??= new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            entry.target.toggleAttribute('data-in-lyrics-viewport', entry.isIntersecting);
        });
    });

    return lyricsViewportObserver;
};

function LyricsLineItem({
    line,
    isActive,
    isKaraokeActive = isActive,
    isUserScrolling,
    pausedScroll,
    distanceFromActive,
    interludeShift,
    interludeShiftDurationMs,
    lineEndMs,
    nextLineStartMs = null,
    enableTightHandoffTailCompression = false,
    currentTime,
    preciseMsRef,
    onSeek,
    fluidMotion = false,
    motionDelay = 0,
    variant,
    isBackground = false,
    hasDuetLine = false,
    onBackgroundHeight,
}: LyricsLineItemProps) {
    const rowRef = useRef<HTMLButtonElement | null>(null);
    const rowVisualStyle = getFluidLyricsRowVisualStyle({
        delay: motionDelay,
        distanceFromActive,
        isActive,
        isUserScrolling,
        pausedScroll,
        variant: variant ?? 'side',
    });
    const canSeek = line.start_time_ms !== null;
    const currentMs = currentTime * 1000;
    const karaokeWords = line.words ?? [];
    const shouldRenderKaraoke = karaokeWords.length > 0;
    // 背景和声只在主句激活时显示，未激活完全不可见。
    // 行保持完整高度（内容常驻），由面板的 visualShifts 在未激活时上移后续行补偿，
    // 与间奏三点同一机制：出现时撑开距离 + 淡入，消失时淡出 + 后续行顶上来。
    // CSS transition 的 delay 属于目标状态：delay 放在 active 类上=淡入延后，
    // inactive 类无 delay=淡出立即开始。淡入延迟 200ms 等撑开空隙基本腾出再出现，
    // 淡出 400ms 保持明显过渡，缓解与下一行的重合。
    const bgTextActive = 'transition-opacity duration-[320ms] ease-in-out delay-[200ms] opacity-100';
    const bgTextInactive = 'transition-opacity duration-[400ms] ease-in-out opacity-0';
    const handleClick = () => {
        if (line.start_time_ms === null) return;
        onSeek(line.start_time_ms / 1000);
    };
    // 背景和声小字：主行 70% 字号 + 固定 0.4 透明度
    const mainTextClass = isBackground
        ? 'text-[clamp(1.24rem,3.32vmin,2.3rem)] text-white/40'
        : 'text-[clamp(1.76rem,4.73vmin,3.26rem)]';
    const translationTextClass = isBackground
        ? 'text-[clamp(0.9rem,2.4vmin,1.62rem)]'
        : 'text-[clamp(1.13rem,2.94vmin,2.02rem)]';
    // 对唱左右分屏：存在对唱行时主行右缩进 15%，对唱行左缩进 15% 并右对齐
    const isDuetRow = line.is_duet === true;
    useEffect(() => {
        const row = rowRef.current;
        if (!row) return;

        const observer = getLyricsViewportObserver();
        if (!observer) {
            row.setAttribute('data-in-lyrics-viewport', '');
            return;
        }

        observer.observe(row);
        return () => observer.unobserve(row);
    }, []);

    useEffect(() => {
        if (!isBackground || !onBackgroundHeight) return;
        const row = rowRef.current;
        if (!row) return;
        const report = () => onBackgroundHeight(row.offsetHeight);
        report();
        const observer = new ResizeObserver(report);
        observer.observe(row);
        return () => observer.disconnect();
    }, [isBackground, onBackgroundHeight]);
    const className = clsx(
        'lyrics-motion-row w-full',
        // 背景和声加对称 padding：内容垂直居中于撑开的空隙（上下留白）
        'py-[clamp(0.7rem,1.3vw,1.25rem)]',
        canSeek ? 'cursor-pointer' : 'cursor-default',
        // 背景和声小字无发光/模糊效果
        isActive && !isBackground ? 'text-white drop-shadow-xl' : 'text-white',
        isDuetRow
            ? 'text-right pl-[15%] origin-right'
            : 'text-left pl-[clamp(1.2rem,2.2vw,2rem)] origin-left',
        hasDuetLine && !isDuetRow ? 'pr-[15%]' : 'pr-[clamp(1.7rem,3vw,2.9rem)]'
    );
    // Fluid scrolling depends on every row's real geometry. Intrinsic placeholders
    // would shift later rows as they enter the viewport and restart their springs.
    const renderingIsolationStyle = fluidMotion
        ? {
            contain: 'layout style paint',
            backfaceVisibility: 'hidden',
        } as const
        : {
            contentVisibility: 'auto',
            contain: 'layout style paint',
            containIntrinsicSize: 'auto 90px',
            backfaceVisibility: 'hidden',
        } as const;
    const targetScale = isActive ? 1 : 0.98;
    const rowTransformOrigin = isDuetRow ? 'right center' : 'left center';
    const content = (
        <div
            data-fluid-lyrics-scale={fluidMotion ? '' : undefined}
            className="lyrics-line-scale-layer"
            style={fluidMotion ? {
                transformOrigin: rowTransformOrigin,
                backfaceVisibility: 'hidden',
            } : {
                transform: 'scale(' + targetScale + ') translateZ(0)',
                transformOrigin: rowTransformOrigin,
                transition: 'transform ' + interludeShiftDurationMs + 'ms cubic-bezier(0.25, 1, 0.5, 1)',
                backfaceVisibility: 'hidden',
            }}
        >
            <span
                style={!shouldRenderKaraoke ? {
                    transitionDelay: `${motionDelay}s`,
                } : undefined}
                className={clsx(
                    'block font-bold leading-[1.38] tracking-wide relative',
                    mainTextClass,
                    shouldRenderKaraoke
                        ? (isBackground
                            ? (isActive ? bgTextActive : bgTextInactive)
                            : isActive
                                ? 'transition-none'
                                : 'transition-opacity duration-500 ease-in-out')
                        : isBackground
                            ? (isActive ? bgTextActive : bgTextInactive)
                            : 'transition-all duration-500 ease-in-out',
                    // 背景行透明度已由 bgTextActive/bgTextInactive 控制，无需重复设置
                    isBackground
                        ? undefined
                        : (isActive ? 'opacity-100' : 'opacity-30 hover:opacity-75')
                )}
            >
                {shouldRenderKaraoke ? (
                    <KaraokeText
                        words={karaokeWords}
                        lineEndMs={lineEndMs}
                        nextLineStartMs={nextLineStartMs}
                        enableTightHandoffTailCompression={enableTightHandoffTailCompression}
                        currentMs={currentMs}
                        preciseMsRef={preciseMsRef}
                        isActive={isKaraokeActive}
                        isFocused={isActive}
                        glowDisabled={isBackground}
                        fillAlpha={isBackground ? 0.65 : 1}
                    />
                ) : (
                    line.text
                )}
            </span>
            {line.translation && (
                <span
                    style={!shouldRenderKaraoke ? {
                        transitionDelay: `${motionDelay}s`,
                    } : undefined}
                    className={clsx(
                        'block font-medium leading-[1.34] tracking-wide mt-1',
                        translationTextClass,
                        // 背景和声译文与主文字同步淡入淡出（含进入延迟）；未激活完全不可见
                        isBackground
                            ? (isActive ? bgTextActive : bgTextInactive)
                            : 'transition-all duration-300',
                        isActive
                            ? isBackground
                                ? 'text-white/40'
                                : 'text-white/65 opacity-95 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]'
                            : isBackground
                                ? 'text-white/40'
                                : 'text-white/32 opacity-80'
                    )}
                >
                    {line.translation}
                </span>
            )}
        </div>
    );

    if (fluidMotion) {
        return (
            <button
                ref={rowRef}
                type="button"
                onClick={handleClick}
                disabled={!canSeek}
                style={{
                    ...renderingIsolationStyle,
                    ...rowVisualStyle,
                }}
                className={className}
            >
                {content}
            </button>
        );
    }

    return (
        <button
            ref={rowRef}
            type="button"
            onClick={handleClick}
            disabled={!canSeek}
            style={{
                ...renderingIsolationStyle,
                filter: rowVisualStyle.filter,
                opacity: rowVisualStyle.opacity,
                transform: 'translateY(' + interludeShift + 'px)',
                transition: 'filter 300ms, opacity 300ms, transform ' + interludeShiftDurationMs + 'ms cubic-bezier(0.25, 1, 0.5, 1)',
            }}
            className={className}
        >
            {content}
        </button>
    );
}

const areLyricsLineItemPropsEqual = (prev: LyricsLineItemProps, next: LyricsLineItemProps) => (
    prev.line === next.line &&
    prev.isActive === next.isActive &&
    prev.isKaraokeActive === next.isKaraokeActive &&
    prev.isUserScrolling === next.isUserScrolling &&
    prev.pausedScroll === next.pausedScroll &&
    (prev.fluidMotion && next.fluidMotion || prev.distanceFromActive === next.distanceFromActive) &&
    prev.interludeShift === next.interludeShift &&
    prev.interludeShiftDurationMs === next.interludeShiftDurationMs &&
    prev.lineEndMs === next.lineEndMs &&
    prev.nextLineStartMs === next.nextLineStartMs &&
    prev.enableTightHandoffTailCompression === next.enableTightHandoffTailCompression &&
    prev.preciseMsRef === next.preciseMsRef &&
    prev.onSeek === next.onSeek &&
    prev.fluidMotion === next.fluidMotion &&
    (
        prev.fluidMotion &&
        next.fluidMotion &&
        (prev.line.words?.length ?? 0) > 0
        || prev.motionDelay === next.motionDelay
    ) &&
    prev.variant === next.variant &&
    prev.isBackground === next.isBackground &&
    prev.hasDuetLine === next.hasDuetLine
);

export default memo(LyricsLineItem, areLyricsLineItemPropsEqual);
