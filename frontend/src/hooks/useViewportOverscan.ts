import { useLayoutEffect, useMemo, useState } from 'react';

const DEFAULT_VIEWPORT_MULTIPLIER = 0.75;

/** 让虚拟列表的预渲染范围随实际滚动视口高度变化。 */
export function useViewportOverscan(
    scrollParent: HTMLElement | null,
    viewportMultiplier = DEFAULT_VIEWPORT_MULTIPLIER,
) {
    const [overscan, setOverscan] = useState(0);

    useLayoutEffect(() => {
        if (!scrollParent) return;

        const update = () => {
            const nextOverscan = Math.round(scrollParent.clientHeight * viewportMultiplier);
            setOverscan((current) => current === nextOverscan ? current : nextOverscan);
        };

        update();
        const observer = new ResizeObserver(update);
        observer.observe(scrollParent);
        return () => observer.disconnect();
    }, [scrollParent, viewportMultiplier]);

    return useMemo(
        () => ({ main: overscan, reverse: overscan }),
        [overscan],
    );
}
