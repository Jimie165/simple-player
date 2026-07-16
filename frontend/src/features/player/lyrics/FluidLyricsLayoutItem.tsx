import { memo, useEffect, useRef, type ReactNode } from 'react';

interface FluidLyricsLayoutItemProps {
    children: ReactNode;
    index: number;
    onMount: (index: number, node: HTMLDivElement) => () => void;
    top: number;
}

/** 承载单个窗口化歌词项并把真实高度回传给轻量布局模型。 */
function FluidLyricsLayoutItem({
    children,
    index,
    onMount,
    top,
}: FluidLyricsLayoutItemProps) {
    const elementRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;
        return onMount(index, element);
    }, [index, onMount]);

    return (
        <div
            ref={elementRef}
            className="absolute left-0 w-full"
            style={{ top }}
        >
            {children}
        </div>
    );
}

export default memo(FluidLyricsLayoutItem);
