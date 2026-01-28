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
            setIsScrolled(false);
            return;
        }

        const target = topSentinelRef.current;
        if (!target) return;

        const resolvedRoot = root ?? findScrollParent(target);

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsScrolled(!entry.isIntersecting);
            },
            { threshold, rootMargin, root: resolvedRoot }
        );

        observer.observe(target);

        return () => observer.disconnect();
    }, [enabled, threshold, rootMargin, root]);

    return { isScrolled, topSentinelRef };
}