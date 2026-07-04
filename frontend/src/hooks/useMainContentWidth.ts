import { useLayoutEffect, useState } from 'react';

const MAIN_CONTENT_SELECTOR = '[data-main-content-query]';

export function useMainContentWidth() {
    // The content area is narrower than window.innerWidth because of the
    // sidebar and detail layers. Using the window width for the first render
    // makes a newly mounted grid pick the wrong card width for one frame.
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
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
