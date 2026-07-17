import { useRef, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';

interface ScrollAreaProps {
    children: ReactNode;
    className?: string;
    topOffset?: number;
    resetOnKeyChange?: unknown;
}

export default function ScrollArea({ children, className, topOffset = 0, resetOnKeyChange }: ScrollAreaProps) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // We use Refs for values that change frequently during drag to avoid stale closures in event listeners
    const thumbState = useRef({
        height: 0,
        top: 0,
        trackHeight: 0,
        scrollHeight: 0,
        scrollRatio: 0
    });

    const [isHovering, setIsHovering] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const requestRef = useRef<number | undefined>(undefined);

    const updateThumb = useCallback(() => {
        if (!viewportRef.current || !thumbRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = viewportRef.current;
        const trackHeight = clientHeight - topOffset;

        const viewportRatio = clientHeight / scrollHeight;

        if (viewportRatio >= 1) {
            thumbRef.current.style.display = 'none';
            thumbState.current.height = 0;
            return;
        }

        thumbRef.current.style.display = 'block';
        const height = Math.max(viewportRatio * trackHeight, 20);

        const maxScroll = scrollHeight - clientHeight;
        const maxThumb = trackHeight - height;

        // Clamp top position
        const top = maxScroll === 0 ? 0 : (scrollTop / maxScroll) * maxThumb;

        // Update DOM directly for performance
        thumbRef.current.style.height = `${height}px`;
        thumbRef.current.style.transform = `translateY(${top}px)`;

        // Update State Ref
        thumbState.current = {
            height,
            top,
            trackHeight,
            scrollHeight,
            scrollRatio: maxThumb > 0 ? maxScroll / maxThumb : 0
        };
    }, [topOffset]);

    // Throttled scroll handler using requestAnimationFrame
    const onScroll = useCallback(() => {
        if (requestRef.current) return;
        requestRef.current = requestAnimationFrame(() => {
            updateThumb();
            requestRef.current = undefined;
        });
    }, [updateThumb]);

    useEffect(() => {
        if (viewportRef.current) {
            viewportRef.current.scrollTop = 0;
            updateThumb();
        }
    }, [resetOnKeyChange, updateThumb]);

    useEffect(() => {
        const viewport = viewportRef.current;
        const content = contentRef.current;
        if (!viewport || !content) return;

        const resizeObserver = new ResizeObserver(() => updateThumb());

        // Observe both viewport (for resize) and content (for height change)
        resizeObserver.observe(viewport);
        resizeObserver.observe(content);

        // Also use MutationObserver as a backup for non-size-changing layout shifts that might affect scrollHeight (rare but possible)
        const mutationObserver = new MutationObserver(() => updateThumb());
        mutationObserver.observe(content, { childList: true, subtree: true });

        viewport.addEventListener('scroll', onScroll);
        window.addEventListener('resize', updateThumb);

        updateThumb();

        return () => {
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            viewport.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', updateThumb);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [onScroll, updateThumb]);

    // Drag Logic
    const dragInfo = useRef({
        startY: 0,
        startScrollTop: 0,
        scrollRatio: 0
    });
    const activePointerId = useRef<number | null>(null);

    const scheduleThumbUpdate = useCallback(() => {
        if (requestRef.current) return;
        requestRef.current = requestAnimationFrame(() => {
            updateThumb();
            requestRef.current = undefined;
        });
    }, [updateThumb]);

    const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        if (!viewportRef.current || !thumbRef.current) return;

        activePointerId.current = e.pointerId;
        try {
            thumbRef.current.setPointerCapture(e.pointerId);
        } catch {
            // Some browsers may reject capture if the pointer is already released.
        }

        dragInfo.current = {
            startY: e.clientY,
            startScrollTop: viewportRef.current.scrollTop,
            scrollRatio: thumbState.current.scrollRatio
        };

        setIsDragging(true);
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        if (!isDragging) return;

        const handlePointerMove = (e: PointerEvent) => {
            if (!viewportRef.current) return;
            if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;

            const deltaY = e.clientY - dragInfo.current.startY;
            viewportRef.current.scrollTop = dragInfo.current.startScrollTop + (deltaY * dragInfo.current.scrollRatio);
            scheduleThumbUpdate();
        };

        const stopDragging = (e: PointerEvent) => {
            if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;

            activePointerId.current = null;
            setIsDragging(false);
            document.body.style.userSelect = '';
            scheduleThumbUpdate();
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopDragging);
        window.addEventListener('pointercancel', stopDragging);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', stopDragging);
            window.removeEventListener('pointercancel', stopDragging);
        };
    }, [isDragging, scheduleThumbUpdate]);

    const handleTrackClick = (e: React.MouseEvent) => {
        if (!viewportRef.current || e.target === thumbRef.current) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const { scrollHeight, clientHeight } = viewportRef.current;
        const trackHeight = clientHeight - topOffset;

        const ratio = clickY / trackHeight;
        viewportRef.current.scrollTo({
            top: ratio * (scrollHeight - clientHeight),
            behavior: 'smooth'
        });
    };

    return (
        <div
            className={clsx("relative overflow-hidden flex-1 flex flex-col min-h-0", className)}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            <div
                ref={viewportRef}
                data-scroll-viewport
                className="flex-1 w-full h-full overflow-y-auto overflow-x-hidden scrollbar-hidden"
            >
                <div ref={contentRef}>
                    {children}
                </div>
            </div>

            <div
                className={clsx(
                    "absolute right-0 bottom-0 w-2.5 z-50 transition-opacity duration-300",
                    (isHovering || isDragging) ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                style={{ top: topOffset }}
                onClick={handleTrackClick}
            >
                <div
                    ref={thumbRef}
                    onPointerDown={handleThumbPointerDown}
                    className={clsx(
                        "absolute right-0.5 w-1.5 rounded-full transition-colors duration-150 cursor-default touch-none",
                        isDragging
                            ? "bg-outline-variant/80 dark:bg-outline-variant/80"
                            : "bg-outline-variant/40 hover:bg-outline-variant/60 dark:bg-outline-variant/40"
                    )}
                />
            </div>
        </div>
    );
}
