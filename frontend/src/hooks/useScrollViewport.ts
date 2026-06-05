import { useEffect, useState } from 'react';

const SCROLL_VIEWPORT_SELECTOR = '[data-scroll-viewport]';

function findScrollViewport(): HTMLElement | null {
    const element = document.querySelector(SCROLL_VIEWPORT_SELECTOR);
    return element instanceof HTMLElement ? element : null;
}

export function useScrollViewport(enabled = true) {
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (!enabled) {
            const frame = requestAnimationFrame(() => setScrollParent(null));
            return () => cancelAnimationFrame(frame);
        }

        let cancelled = false;
        let frame = 0;
        let observer: MutationObserver | null = null;

        const resolve = () => {
            if (cancelled) return true;

            const element = findScrollViewport();
            if (!element) return false;

            setScrollParent(element);
            return true;
        };

        const retry = () => {
            if (resolve() || cancelled) return;
            frame = requestAnimationFrame(retry);
        };

        frame = requestAnimationFrame(retry);
        observer = new MutationObserver(() => {
            if (resolve()) {
                observer?.disconnect();
                observer = null;
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            observer?.disconnect();
        };
    }, [enabled]);

    return scrollParent;
}
