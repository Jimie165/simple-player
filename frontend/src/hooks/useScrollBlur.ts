import { useEffect, useRef, useState } from 'react';

type UseScrollBlurOptions = {
    threshold?: number | number[];
    rootMargin?: string;
    enabled?: boolean;
};

export function useScrollBlur(options: UseScrollBlurOptions = {}) {
    const { threshold = [0], rootMargin = '0px', enabled = true } = options;
    const topSentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setIsScrolled(false);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsScrolled(!entry.isIntersecting);
            },
            { threshold, rootMargin }
        );

        if (topSentinelRef.current) {
            observer.observe(topSentinelRef.current);
        }

        return () => observer.disconnect();
    }, [enabled, threshold, rootMargin]);

    return { isScrolled, topSentinelRef };
}