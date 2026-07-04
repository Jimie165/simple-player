import { useEffect, useRef, useState } from 'react';

type UseScrollBlurOptions = {
    threshold?: number | number[];
    rootMargin?: string;
    enabled?: boolean;
    root?: Element | null;
};

export function useScrollBlur(options: UseScrollBlurOptions = {}) {
    const { threshold = [0], rootMargin = '0px', enabled = true, root = null } = options;
    const topSentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    const findScrollParent = (element: HTMLElement | null) => {
        let current = element?.parentElement ?? null;
        while (current) {
            const style = window.getComputedStyle(current);
            const overflowY = style.overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    };

    useEffect(() => {
        if (!enabled) {
            const frame = requestAnimationFrame(() => setIsScrolled(false));
            return () => cancelAnimationFrame(frame);
        }

        const target = topSentinelRef.current;
        if (!target) return;

        const resolvedRoot = root ?? findScrollParent(target);

        const observer = new IntersectionObserver(
            ([entry]) => {
                const rootRect = resolvedRoot?.getBoundingClientRect();
                const targetRect = entry.boundingClientRect;
                const rootIsHidden = !!rootRect && (rootRect.width <= 0 || rootRect.height <= 0);
                const targetIsHidden = targetRect.width <= 0 || targetRect.height <= 0;

                // display:none reports the sentinel as non-intersecting. Keep
                // the last real scroll state while the base layer is suspended.
                if (rootIsHidden || targetIsHidden) return;
                setIsScrolled(!entry.isIntersecting);
            },
            { threshold, rootMargin, root: resolvedRoot }
        );
        observer.observe(target);

        const syncAfterBaseLayerRestore = () => {
            // Hidden targets are reported as non-intersecting. Recompute from
            // the preserved scroll position before the player reveals them.
            setIsScrolled((resolvedRoot?.scrollTop ?? 0) > 1);
        };
        window.addEventListener('base-layer-restored', syncAfterBaseLayerRestore);

        return () => {
            observer.disconnect();
            window.removeEventListener('base-layer-restored', syncAfterBaseLayerRestore);
        };
    }, [enabled, threshold, rootMargin, root]);

    return { isScrolled, topSentinelRef };
}
