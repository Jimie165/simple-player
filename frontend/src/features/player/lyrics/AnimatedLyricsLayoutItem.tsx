import { memo, useLayoutEffect, useRef, type ReactNode } from 'react';

interface AnimatedLyricsLayoutItemProps {
    children: ReactNode;
    index: number;
    onAnimateMount: (index: number, node: HTMLDivElement) => (() => void) | undefined;
    onMount: (index: number, node: HTMLDivElement) => () => void;
    top: number;
}

/** 承载单个窗口化歌词项并把真实高度回传给轻量布局模型。 */
function AnimatedLyricsLayoutItem({
    children,
    index,
    onAnimateMount,
    onMount,
    top,
}: AnimatedLyricsLayoutItemProps) {
    const elementRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        const element = elementRef.current;
        if (!element) return;
        const disposeAnimation = onAnimateMount(index, element);
        const disposeMeasurement = onMount(index, element);
        return () => {
            disposeMeasurement();
            disposeAnimation?.();
        };
    }, [index, onAnimateMount, onMount]);

    return (
        <div
            ref={elementRef}
            className="animated-lyrics-row-shell absolute left-0 w-full"
            data-animated-lyrics-row-key={index}
            style={{ top }}
        >
            {children}
        </div>
    );
}

export default memo(AnimatedLyricsLayoutItem);
