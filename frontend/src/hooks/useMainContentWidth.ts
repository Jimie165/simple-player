import { useEffect, useState } from 'react';

const MAIN_CONTENT_SELECTOR = '[data-main-content-query]';

export function useMainContentWidth() {
    const [width, setWidth] = useState(() => (
        typeof window === 'undefined' ? 0 : window.innerWidth
    ));

    useEffect(() => {
        const target = document.querySelector(MAIN_CONTENT_SELECTOR);
        if (!(target instanceof HTMLElement)) return;

        const updateWidth = () => {
            setWidth(Math.round(target.clientWidth));
        };

        updateWidth();

        const resizeObserver = new ResizeObserver(updateWidth);
        resizeObserver.observe(target);

        return () => resizeObserver.disconnect();
    }, []);

    return width;
}
