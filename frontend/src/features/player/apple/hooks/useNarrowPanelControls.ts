import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

const NARROW_UPWARD_REVEAL_THRESHOLD = 96;

interface UseNarrowPanelControlsArgs {
    isOpen: boolean;
    isNarrowPanelLayout: boolean;
    isQueueOpen: boolean;
    isLyricsOpen: boolean;
}

export function useNarrowPanelControls({
    isOpen,
    isNarrowPanelLayout,
    isQueueOpen,
    isLyricsOpen,
}: UseNarrowPanelControlsArgs) {
    const [narrowControlsVisible, setNarrowControlsVisible] = useState(true);
    const narrowControlsHideTimeoutRef = useRef<number | null>(null);
    const narrowControlsRef = useRef<HTMLDivElement | null>(null);
    const isPointerInsideNarrowControlsRef = useRef(false);
    const upwardScrollRevealDistanceRef = useRef(0);

    useEffect(() => {
        return () => {
            if (narrowControlsHideTimeoutRef.current !== null) window.clearTimeout(narrowControlsHideTimeoutRef.current);
        };
    }, []);

    const clearNarrowControlsHideTimer = useCallback(() => {
        if (narrowControlsHideTimeoutRef.current !== null) {
            window.clearTimeout(narrowControlsHideTimeoutRef.current);
            narrowControlsHideTimeoutRef.current = null;
        }
    }, []);

    const hideNarrowControlsLater = useCallback(() => {
        clearNarrowControlsHideTimer();
        narrowControlsHideTimeoutRef.current = window.setTimeout(() => {
            if (isPointerInsideNarrowControlsRef.current) {
                narrowControlsHideTimeoutRef.current = null;
                return;
            }
            setNarrowControlsVisible(false);
            narrowControlsHideTimeoutRef.current = null;
        }, 2500);
    }, [clearNarrowControlsHideTimer]);

    const revealNarrowControls = useCallback((autoHide = true) => {
        upwardScrollRevealDistanceRef.current = 0;
        setNarrowControlsVisible(true);
        if (!isNarrowPanelLayout) return;
        if (autoHide) {
            hideNarrowControlsLater();
            return;
        }
        clearNarrowControlsHideTimer();
    }, [clearNarrowControlsHideTimer, hideNarrowControlsLater, isNarrowPanelLayout]);

    const hideNarrowControlsNow = useCallback(() => {
        clearNarrowControlsHideTimer();
        isPointerInsideNarrowControlsRef.current = false;
        upwardScrollRevealDistanceRef.current = 0;
        setNarrowControlsVisible(false);
    }, [clearNarrowControlsHideTimer]);

    const handleNarrowPanelScroll = (direction: 'up' | 'down', delta = 16) => {
        if (!isNarrowPanelLayout) return;
        if (direction === 'down') {
            hideNarrowControlsNow();
            return;
        }
        if (narrowControlsVisible) {
            hideNarrowControlsLater();
            return;
        }
        upwardScrollRevealDistanceRef.current += Math.min(delta, 48);
        if (upwardScrollRevealDistanceRef.current >= NARROW_UPWARD_REVEAL_THRESHOLD) {
            revealNarrowControls();
        }
    };

    const handleNarrowActivity = () => {
        if (isNarrowPanelLayout) revealNarrowControls();
    };

    const handleNarrowPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!isNarrowPanelLayout || narrowControlsVisible) return;
        const controlsRect = narrowControlsRef.current?.getBoundingClientRect();
        const fallbackBoundary = window.innerHeight - 120;
        const revealBoundary = controlsRect
            ? controlsRect.top + controlsRect.height / 2
            : fallbackBoundary;
        if (event.clientY >= revealBoundary) {
            isPointerInsideNarrowControlsRef.current = controlsRect
                ? event.clientX >= controlsRect.left &&
                event.clientX <= controlsRect.right &&
                event.clientY >= controlsRect.top &&
                event.clientY <= controlsRect.bottom
                : true;
            revealNarrowControls(!isPointerInsideNarrowControlsRef.current);
        }
    };

    const handleNarrowControlsPointerEnter = () => {
        if (!isNarrowPanelLayout) return;
        isPointerInsideNarrowControlsRef.current = true;
        clearNarrowControlsHideTimer();
    };

    const handleNarrowControlsPointerMove = () => {
        if (!isNarrowPanelLayout) return;
        isPointerInsideNarrowControlsRef.current = true;
        clearNarrowControlsHideTimer();
    };

    const handleNarrowControlsPointerLeave = () => {
        if (!isNarrowPanelLayout) return;
        isPointerInsideNarrowControlsRef.current = false;
        if (narrowControlsVisible) hideNarrowControlsLater();
    };

    useEffect(() => {
        if (isOpen && isNarrowPanelLayout) {
            const frame = requestAnimationFrame(() => revealNarrowControls());
            return () => cancelAnimationFrame(frame);
        }
        if (narrowControlsHideTimeoutRef.current !== null) {
            window.clearTimeout(narrowControlsHideTimeoutRef.current);
            narrowControlsHideTimeoutRef.current = null;
        }
        isPointerInsideNarrowControlsRef.current = false;
        const frame = requestAnimationFrame(() => setNarrowControlsVisible(true));
        return () => cancelAnimationFrame(frame);
    }, [isOpen, isNarrowPanelLayout, isQueueOpen, isLyricsOpen, revealNarrowControls]);

    return {
        narrowControlsVisible,
        narrowControlsRef,
        revealNarrowControls,
        handleNarrowPanelScroll,
        handleNarrowActivity,
        handleNarrowPointerMove,
        handleNarrowControlsPointerEnter,
        handleNarrowControlsPointerMove,
        handleNarrowControlsPointerLeave,
    };
}
