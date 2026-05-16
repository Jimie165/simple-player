import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';

interface OverflowMarqueeProps {
    children: ReactNode;
    duplicateContent?: ReactNode;
    className?: string;
    contentClassName?: string;
    gapPx?: number;
    startDelaySec?: number;
    resetToken?: string | number;
    behavior?: 'loop' | 'hover-once' | 'auto-then-hover';
}

export default function OverflowMarquee({
    children,
    duplicateContent,
    className,
    contentClassName,
    gapPx = 32,
    startDelaySec = 2,
    resetToken,
    behavior = 'auto-then-hover',
}: OverflowMarqueeProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const hoverTimerRef = useRef<number | null>(null);
    const [metrics, setMetrics] = useState({ overflow: false, distance: 0, duration: 0 });
    const [phase, setPhase] = useState<'idle' | 'initial-delay' | 'hover-delay' | 'animating' | 'finished'>('idle');
    const [animationKey, setAnimationKey] = useState(0);

    useLayoutEffect(() => {
        const container = containerRef.current;
        const content = contentRef.current;
        if (!container || !content) return;

        const update = () => {
            const contentWidth = content.scrollWidth;
            const containerWidth = container.clientWidth;
            const overflow = contentWidth - containerWidth > 14;
            const distance = overflow ? contentWidth + gapPx : 0;
            const duration = overflow ? Math.max(10, distance / 28) : 0;
            setMetrics((prev) => {
                if (
                    prev.overflow === overflow &&
                    prev.distance === distance &&
                    prev.duration === duration
                ) {
                    return prev;
                }
                return { overflow, distance, duration };
            });
        };

        update();

        const resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(container);
        resizeObserver.observe(content);

        return () => {
            resizeObserver.disconnect();
        };
    }, [children, gapPx]);

    useLayoutEffect(() => {
        if (behavior === 'auto-then-hover') {
            setPhase('initial-delay');
        } else {
            setPhase('idle');
        }
        if (hoverTimerRef.current !== null) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    }, [resetToken, behavior]);

    useLayoutEffect(() => {
        if (!metrics.overflow) return;

        if (phase === 'initial-delay') {
            const timer = window.setTimeout(() => {
                setAnimationKey(v => v + 1);
                setPhase('animating');
            }, startDelaySec * 1000);
            return () => window.clearTimeout(timer);
        }

        if (phase === 'hover-delay') {
            const timer = window.setTimeout(() => {
                setAnimationKey(v => v + 1);
                setPhase('animating');
            }, startDelaySec * 1000);
            return () => window.clearTimeout(timer);
        }
    }, [phase, metrics.overflow, startDelaySec]);

    const marqueeStyle = metrics.overflow
        ? ({
            ['--marquee-distance' as string]: `${metrics.distance}px`,
            ['--marquee-duration' as string]: `${metrics.duration}s`,
            ['--marquee-gap' as string]: `${gapPx}px`,
            ['--marquee-delay' as string]: '0s',
            animationIterationCount: behavior === 'loop' ? 'infinite' : 1,
        } as CSSProperties)
        : undefined;

    const containerMaskStyle: CSSProperties | undefined = metrics.overflow ? {
        maskImage: phase === 'animating' || behavior === 'loop'
            ? 'linear-gradient(to right, transparent 0, black 12px, black calc(100% - 18px), transparent 100%)'
            : 'linear-gradient(to right, black 0, black calc(100% - 18px), transparent 100%)',
        WebkitMaskImage: phase === 'animating' || behavior === 'loop'
            ? 'linear-gradient(to right, transparent 0, black 12px, black calc(100% - 18px), transparent 100%)'
            : 'linear-gradient(to right, black 0, black calc(100% - 18px), transparent 100%)'
    } : undefined;

    const shouldAnimate = metrics.overflow && (behavior === 'loop' || phase === 'animating');
    const shouldShowDuplicate = metrics.overflow && (behavior === 'loop' || phase === 'animating');
    const repeatedContent = duplicateContent ?? children;

    const startHoverAnimation = () => {
        if (!metrics.overflow || behavior === 'loop') return;
        if (phase === 'animating' || phase === 'initial-delay' || phase === 'hover-delay') return;

        if (behavior === 'auto-then-hover' || behavior === 'hover-once') {
            setPhase('hover-delay');
        }
    };

    const stopHoverAnimation = () => {
        if (phase === 'hover-delay') {
            setPhase('idle');
        }
    };

    return (
        <div
            ref={containerRef}
            className={clsx(
                "overflow-hidden min-w-0 transition-all",
                className
            )}
            style={containerMaskStyle}
            onMouseEnter={startHoverAnimation}
            onMouseLeave={stopHoverAnimation}
        >
            <div
                key={animationKey}
                style={marqueeStyle}
                className={clsx(
                    "flex w-max",
                    shouldAnimate && "marquee-loop"
                )}
                onAnimationEnd={() => {
                    if (behavior === 'hover-once' || behavior === 'auto-then-hover') {
                        setPhase('finished');
                    }
                }}
            >
                <div
                    ref={contentRef}
                    className={clsx(
                        "min-w-0",
                        shouldAnimate && "inline-flex shrink-0",
                        contentClassName
                    )}
                >
                    {children}
                </div>
                {shouldShowDuplicate && (
                    <div
                        aria-hidden="true"
                        className={clsx("inline-flex shrink-0 pointer-events-none", contentClassName)}
                        style={{ paddingLeft: gapPx }}
                    >
                        {repeatedContent}
                    </div>
                )}
            </div>
        </div>
    );
}
