import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import type { SidePanel } from '@/features/player/apple/shared/types';

interface UseAppleMusicPanelsArgs {
    isOpen: boolean;
    isQueueOpen: boolean;
    isLyricsOpen: boolean;
    lyricsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    mainContentWidth: number;
    isNarrowPanelLayout: boolean;
    onBeforeNarrowClose?: () => void;
}

export function useAppleMusicPanels({
    isOpen,
    isQueueOpen,
    isLyricsOpen,
    lyricsStatus,
    mainContentWidth,
    isNarrowPanelLayout,
    onBeforeNarrowClose,
}: UseAppleMusicPanelsArgs) {
    const [queueMounted, setQueueMounted] = useState(isQueueOpen);
    const [queueScrollToTopSignal, setQueueScrollToTopSignal] = useState(0);
    const queueScrollDidMountRef = useRef(false);
    const [lyricsMounted, setLyricsMounted] = useState(isLyricsOpen);
    const [panelFlipTarget, setPanelFlipTarget] = useState<SidePanel | null>(null);
    const [isPanelFlipping, setIsPanelFlipping] = useState(false);
    const panelFlipRafRef = useRef<number | null>(null);
    const panelFlipTimeoutRef = useRef<number | null>(null);
    const panelFlipSequenceRef = useRef(0);
    const panelCloseRafRef = useRef<number | null>(null);
    const [closingPanel, setClosingPanel] = useState<SidePanel | null>(null);

    useEffect(() => {
        if (!isQueueOpen) return;
        const frame = requestAnimationFrame(() => setQueueMounted(true));
        return () => cancelAnimationFrame(frame);
    }, [isQueueOpen]);

    useEffect(() => {
        if (!isLyricsOpen) return;
        const frame = requestAnimationFrame(() => setLyricsMounted(true));
        return () => cancelAnimationFrame(frame);
    }, [isLyricsOpen]);

    useEffect(() => {
        if (mainContentWidth < 520) return;
        const frame = requestAnimationFrame(() => {
            setClosingPanel(null);
        });
        return () => cancelAnimationFrame(frame);
    }, [mainContentWidth]);

    useEffect(() => {
        if (!closingPanel || isNarrowPanelLayout) return;
        const frame = requestAnimationFrame(() => setClosingPanel(null));
        return () => cancelAnimationFrame(frame);
    }, [closingPanel, isNarrowPanelLayout]);

    useEffect(() => {
        if (!queueScrollDidMountRef.current) {
            queueScrollDidMountRef.current = true;
            return;
        }
        if (!isQueueOpen) return;
        const frame = requestAnimationFrame(() => setQueueScrollToTopSignal((v) => v + 1));
        return () => cancelAnimationFrame(frame);
    }, [isQueueOpen]);

    useEffect(() => {
        if (!isOpen || !isQueueOpen) return;
        const frame = requestAnimationFrame(() => setQueueScrollToTopSignal((v) => v + 1));
        return () => cancelAnimationFrame(frame);
    }, [isOpen, isQueueOpen]);

    useEffect(() => {
        return () => {
            if (panelFlipRafRef.current !== null) window.cancelAnimationFrame(panelFlipRafRef.current);
            if (panelFlipTimeoutRef.current !== null) window.clearTimeout(panelFlipTimeoutRef.current);
            if (panelCloseRafRef.current !== null) window.cancelAnimationFrame(panelCloseRafRef.current);
        };
    }, []);

    const setQueuePanelOpen = useCallback((open: boolean) => {
        usePlayerStore.setState((state) => ({
            isQueueOpen: open,
            isLyricsOpen: open ? false : state.isLyricsOpen,
        }));
    }, []);

    const setLyricsPanelOpen = useCallback((open: boolean) => {
        usePlayerStore.setState((state) => ({
            isLyricsOpen: open,
            isQueueOpen: open ? false : state.isQueueOpen,
        }));
    }, []);

    const cancelPendingPanelClose = useCallback(() => {
        if (panelCloseRafRef.current !== null) {
            window.cancelAnimationFrame(panelCloseRafRef.current);
            panelCloseRafRef.current = null;
        }
    }, []);

    const startPanelFlip = (target: SidePanel, toggle: () => void) => {
        const sequence = ++panelFlipSequenceRef.current;
        cancelPendingPanelClose();
        if (panelFlipRafRef.current !== null) window.cancelAnimationFrame(panelFlipRafRef.current);
        if (panelFlipTimeoutRef.current !== null) window.clearTimeout(panelFlipTimeoutRef.current);

        setPanelFlipTarget(target);
        setIsPanelFlipping(false);
        panelFlipRafRef.current = window.requestAnimationFrame(() => {
            if (panelFlipSequenceRef.current !== sequence) return;
            panelFlipRafRef.current = null;
            setIsPanelFlipping(true);
            toggle();
            panelFlipTimeoutRef.current = window.setTimeout(() => {
                if (panelFlipSequenceRef.current !== sequence) return;
                setIsPanelFlipping(false);
                setPanelFlipTarget(null);
                panelFlipTimeoutRef.current = null;
            }, 420);
        });
    };

    const resetPanelFlipState = useCallback(() => {
        panelFlipSequenceRef.current += 1;
        if (panelFlipRafRef.current !== null) {
            window.cancelAnimationFrame(panelFlipRafRef.current);
            panelFlipRafRef.current = null;
        }
        if (panelFlipTimeoutRef.current !== null) {
            window.clearTimeout(panelFlipTimeoutRef.current);
            panelFlipTimeoutRef.current = null;
        }
        setIsPanelFlipping(false);
        setPanelFlipTarget(null);
    }, []);

    const closePanel = useCallback((panel: SidePanel) => {
        cancelPendingPanelClose();
        resetPanelFlipState();
        if (mainContentWidth < 520) {
            onBeforeNarrowClose?.();
            panelCloseRafRef.current = window.requestAnimationFrame(() => {
                panelCloseRafRef.current = window.requestAnimationFrame(() => {
                    setClosingPanel(panel);
                    panelCloseRafRef.current = window.requestAnimationFrame(() => {
                        panelCloseRafRef.current = window.requestAnimationFrame(() => {
                            panelCloseRafRef.current = null;
                            if (panel === 'queue') {
                                setQueuePanelOpen(false);
                                return;
                            }
                            setLyricsPanelOpen(false);
                        });
                    });
                });
            });
            return;
        }
        if (panel === 'queue') {
            setQueuePanelOpen(false);
            return;
        }
        setLyricsPanelOpen(false);
    }, [cancelPendingPanelClose, mainContentWidth, onBeforeNarrowClose, resetPanelFlipState, setLyricsPanelOpen, setQueuePanelOpen]);

    const handleToggleQueue = () => {
        if (!queueMounted) setQueueMounted(true);
        if (isLyricsOpen && !isQueueOpen) {
            cancelPendingPanelClose();
            setClosingPanel(null);
            startPanelFlip('queue', () => setQueuePanelOpen(true));
            return;
        }
        if (isQueueOpen) {
            closePanel('queue');
            return;
        }
        resetPanelFlipState();
        cancelPendingPanelClose();
        setClosingPanel(null);
        setQueuePanelOpen(true);
    };

    const handleToggleLyrics = () => {
        if (!lyricsMounted) setLyricsMounted(true);
        if (isQueueOpen && !isLyricsOpen) {
            cancelPendingPanelClose();
            setClosingPanel(null);
            startPanelFlip('lyrics', () => setLyricsPanelOpen(true));
            return;
        }
        if (isLyricsOpen) {
            closePanel('lyrics');
            return;
        }
        resetPanelFlipState();
        cancelPendingPanelClose();
        setClosingPanel(null);
        setLyricsPanelOpen(true);
    };

    useEffect(() => {
        if (lyricsStatus !== 'empty' || !isLyricsOpen) return;
        const frame = requestAnimationFrame(() => closePanel('lyrics'));
        return () => cancelAnimationFrame(frame);
    }, [lyricsStatus, isLyricsOpen, closePanel]);

    return {
        queueMounted,
        queueScrollToTopSignal,
        lyricsMounted,
        panelFlipTarget,
        isPanelFlipping,
        closingPanel,
        handleToggleQueue,
        handleToggleLyrics,
    };
}
