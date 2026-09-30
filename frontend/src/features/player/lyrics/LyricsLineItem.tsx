import clsx from 'clsx';
import { memo, useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { LyricsLine } from '@/types';
import KaraokeText from '@/features/player/lyrics/KaraokeText';
import { getAnimatedLyricsRowVisualStyle } from '@/features/player/lyrics/animatedLyricsMotion';
import { useThemeStore } from '@/store/useThemeStore';

interface LyricsLineItemProps {
    line: LyricsLine;
    isActive: boolean;
    isKaraokeActive?: boolean;
    isSeekExiting?: boolean;
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
    isPlaying?: boolean;
    playbackSyncKey?: number;
    onSeek: (time: number) => void;
    animatedMotion?: boolean;
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
    isSeekExiting = false,
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
    isPlaying,
    playbackSyncKey,
    onSeek,
    animatedMotion = false,
    motionDelay = 0,
    variant,
    isBackground = false,
    hasDuetLine = false,
    onBackgroundHeight,
}: LyricsLineItemProps) {
    const lyricLineBlendEnabled = useThemeStore(state => state.lyricLineBlendEnabled);
    const rowRef = useRef<HTMLButtonElement | null>(null);
    const interactionRef = useRef<HTMLDivElement | null>(null);
    const pressAnimationRef = useRef<Animation | null>(null);
    useEffect(() => () => pressAnimationRef.current?.cancel(), []);
    const rowVisualStyle = getAnimatedLyricsRowVisualStyle({
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
    // 背景和声行：简单淡入淡出 + 从小变大（对齐间奏三点入场：
    // scale 从 0.8 放大 + 淡入同步 + origin-left，出现过程即逐渐变大）。
    // 独立 scale 层避免与 animator 的 scale 层（data-animated-lyrics-scale）冲突。
    // 过渡节奏与文字透明度一致：active 类 delay 200ms（等撑开空隙腾出再放大淡入），
    // inactive 无 delay（缩小淡出立即开始）。
    const bgScaleActive = 'transition-transform duration-[320ms] ease-in-out delay-[200ms] scale-100';
    const bgScaleInactive = 'transition-transform duration-[400ms] ease-in-out scale-80';
    const handleClick = () => {
        if (line.start_time_ms === null) return;
        // 点击反馈独占内层 transform，不覆盖滚动或激活缩放；快速连点重播而不叠加。
        pressAnimationRef.current?.cancel();
        pressAnimationRef.current = interactionRef.current?.animate([
            { transform: 'scale(0.95)', offset: 0 },
            { transform: 'scale(1.01)', offset: 0.6 },
            { transform: 'scale(1)', offset: 1 },
        ], { duration: 450, easing: 'ease-out' }) ?? null;
        onSeek(line.start_time_ms / 1000);
    };
    // 背景和声：主行 70% 字号；暗层按 40% 控制，刷白只略微提亮。
    // 此处 text-white/30 仅作继承兜底（无词时被 inline color 覆盖）
    const mainTextClass = isBackground
        ? 'text-[clamp(1.24rem,3.32vmin,2.3rem)] text-white/30'
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
        canSeek && (!isBackground || isActive) && 'lyrics-hover-target',
        // 背景和声行距压缩：顶部靠近主歌词
        isBackground
            ? 'pt-[clamp(0.2rem,0.5vw,0.4rem)] pb-[clamp(0.4rem,0.8vw,0.75rem)]'
            : 'py-[clamp(1rem,1.3vw,1.25rem)]',
        canSeek ? 'cursor-pointer' : 'cursor-default',
        'text-white',
        isDuetRow
            ? 'text-right pl-[15%] origin-right'
            : 'text-left pl-[clamp(1.2rem,2.2vw,2rem)] origin-left',
        hasDuetLine && !isDuetRow ? 'pr-[15%]' : 'pr-[clamp(1.7rem,3vw,2.9rem)]'
    );
    // 动画模式已有行级虚拟化；挂载行必须提供真实高度，不能用旧尺寸占位参与重测。
    const renderingIsolationStyle: CSSProperties = animatedMotion
        ? {
            contain: 'layout style paint',
            backfaceVisibility: 'hidden',
        }
        : {
            contentVisibility: 'auto',
            contain: 'layout style paint',
            containIntrinsicSize: 'auto 90px',
            backfaceVisibility: 'hidden',
        };
    const targetScale = isActive ? 1 : 0.98;
    const rowTransformOrigin = isDuetRow ? 'right center' : 'left center';
    const content = (
        <div
            data-animated-lyrics-scale={animatedMotion ? '' : undefined}
            className="lyrics-line-scale-layer"
            style={animatedMotion ? {
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
                className={clsx(
                    'block font-bold leading-[1.38] tracking-wide relative',
                    mainTextClass,
                    shouldRenderKaraoke
                        ? (isBackground
                            ? (isActive ? bgTextActive : bgTextInactive)
                            : 'opacity-100')
                        : isBackground
                            ? (isActive ? bgTextActive : bgTextInactive)
                            : 'transition-[opacity,color] duration-500 ease-in-out',
                    // 逐字行由暗底色和高光层交叉淡出；纯文本仍使用整行透明度。
                    isBackground
                        ? undefined
                        : (!shouldRenderKaraoke && (isActive ? 'opacity-100' : 'opacity-30'))
                )}
                style={{
                    ...(!shouldRenderKaraoke ? { transitionDelay: `${motionDelay}s` } : {}),
                    // 没有逐字时间的和声保留纯文本透明度。
                    color: (isBackground && !shouldRenderKaraoke) ? 'rgba(255,255,255,0.3)' : undefined,
                }}
            >
                {shouldRenderKaraoke ? (
                    <KaraokeText
                        words={karaokeWords}
                        lineEndMs={lineEndMs}
                        nextLineStartMs={nextLineStartMs}
                        enableTightHandoffTailCompression={enableTightHandoffTailCompression}
                        currentMs={currentMs}
                        preciseMsRef={preciseMsRef}
                        isPlaying={isPlaying}
                        playbackSyncKey={playbackSyncKey}
                        isActive={isKaraokeActive}
                        isFocused={isActive}
                        isSeekExiting={isSeekExiting}
                        glowDisabled={isBackground}
                        fillAlpha={isBackground ? (lyricLineBlendEnabled ? 0.22 : 0.3) : 1}
                    />
                ) : (
                    line.text
                )}
            </span>
            {line.translation && (
                <span
                    style={isBackground && !shouldRenderKaraoke ? {
                        transitionDelay: `${motionDelay}s`,
                    } : undefined}
                    className={clsx(
                        'block font-medium leading-[1.34] tracking-wide mt-1 text-white/30',
                        translationTextClass,
                        // 译文不单独高亮；和声仍需随主文字出现和退出，避免残留。
                        isBackground && (isActive ? bgTextActive : bgTextInactive)
                    )}
                >
                    {line.translation}
                </span>
            )}
        </div>
    );

    // 背景和声行：独立层承载从小变大过渡（配合文字淡入淡出），
    // 对齐间奏 origin-left，不与 animator 的 scale 层（data-animated-lyrics-scale）冲突
    const renderedContent = isBackground ? (
        <div
            className={clsx(
                'lyrics-bg-scale-layer origin-left',
                isActive ? bgScaleActive : bgScaleInactive
            )}
            style={{ willChange: 'transform' }}
        >
            {content}
        </div>
    ) : content;

    const interactiveContent = (
        <div
            ref={interactionRef}
            className={clsx('lyrics-interaction-layer', isBackground && 'lyrics-interaction-background')}
            style={{ transformOrigin: rowTransformOrigin }}
        >
            {renderedContent}
        </div>
    );

    if (animatedMotion) {
        return (
            <button
                ref={rowRef}
                type="button"
                onPointerDown={() => pressAnimationRef.current?.cancel()}
                onClick={handleClick}
                disabled={!canSeek}
                style={{
                    ...renderingIsolationStyle,
                }}
                className={className}
            >
                {interactiveContent}
            </button>
        );
    }

    return (
        <button
            ref={rowRef}
            type="button"
            onPointerDown={() => pressAnimationRef.current?.cancel()}
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
            {interactiveContent}
        </button>
    );
}

const areLyricsLineItemPropsEqual = (prev: LyricsLineItemProps, next: LyricsLineItemProps) => (
    prev.line === next.line &&
    prev.isActive === next.isActive &&
    prev.isKaraokeActive === next.isKaraokeActive &&
    prev.isSeekExiting === next.isSeekExiting &&
    prev.isUserScrolling === next.isUserScrolling &&
    prev.pausedScroll === next.pausedScroll &&
    (prev.animatedMotion && next.animatedMotion || prev.distanceFromActive === next.distanceFromActive) &&
    (prev.animatedMotion && next.animatedMotion || prev.interludeShift === next.interludeShift) &&
    prev.interludeShiftDurationMs === next.interludeShiftDurationMs &&
    prev.lineEndMs === next.lineEndMs &&
    prev.nextLineStartMs === next.nextLineStartMs &&
    prev.enableTightHandoffTailCompression === next.enableTightHandoffTailCompression &&
    prev.preciseMsRef === next.preciseMsRef &&
    prev.isPlaying === next.isPlaying &&
    prev.playbackSyncKey === next.playbackSyncKey &&
    prev.onSeek === next.onSeek &&
    prev.animatedMotion === next.animatedMotion &&
    (
        prev.animatedMotion &&
        next.animatedMotion &&
        (prev.line.words?.length ?? 0) > 0
        || prev.motionDelay === next.motionDelay
    ) &&
    prev.variant === next.variant &&
    prev.isBackground === next.isBackground &&
    prev.hasDuetLine === next.hasDuetLine
);

export default memo(LyricsLineItem, areLyricsLineItemPropsEqual);
