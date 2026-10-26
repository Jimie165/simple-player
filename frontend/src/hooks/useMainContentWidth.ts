import { useLayoutEffect, useState } from 'react';

const MAIN_CONTENT_SELECTOR = '[data-main-content-query]';

/** 只依赖布局断点的视图可传入断点，避免宽度动画逐像素触发重渲染。 */
export function useMainContentWidth(breakpoints?: readonly number[]) {
    // The content area is narrower than window.innerWidth because of the
    // sidebar and detail layers. Using the window width for the first render
    // makes a newly mounted grid pick the wrong card width for one frame.
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const target = document.querySelector(MAIN_CONTENT_SELECTOR);
        if (!(target instanceof HTMLElement)) return;

        let lastWidth = 0;
        const updateWidth = (nextWidth: number) => {
            const roundedWidth = Math.round(nextWidth);
            if (lastWidth === roundedWidth) return;
            if (lastWidth !== 0 && breakpoints && !breakpoints.some((point) => (lastWidth >= point) !== (roundedWidth >= point))) return;
            lastWidth = roundedWidth;
            setWidth(roundedWidth);
        };

        updateWidth(target.clientWidth);
        if (breakpoints?.length === 0) return;

        const resizeObserver = new ResizeObserver(([entry]) => {
            if (entry) updateWidth(entry.contentRect.width);
        });
        resizeObserver.observe(target);

        return () => resizeObserver.disconnect();
    }, [breakpoints]);

    return width;
}
