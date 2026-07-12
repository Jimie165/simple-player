import { useCallback, useEffect, useRef, useState } from 'react';

const waitForPaint = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
});

/** 管理沉浸播放器与底层页面的冻结、预热和开关时序。 */
export function useImmersivePlayerTransition() {
    const [isOpen, setIsOpen] = useState(false);
    const [isBaseLayerFrozen, setIsBaseLayerFrozen] = useState(false);
    const isOpenRef = useRef(false);
    const transitionSequenceRef = useRef(0);

    const open = useCallback(() => {
        transitionSequenceRef.current += 1;
        isOpenRef.current = true;
        setIsBaseLayerFrozen(false);
        setIsOpen(true);
    }, []);

    const close = useCallback(async () => {
        if (!isOpenRef.current) return;

        const sequence = ++transitionSequenceRef.current;
        setIsBaseLayerFrozen(false);

        // 播放页仍完全遮挡窗口时，先给所有底层高消耗视图两帧完成布局和绘制。
        await waitForPaint();
        await waitForPaint();
        if (transitionSequenceRef.current !== sequence) return;

        isOpenRef.current = false;
        setIsOpen(false);
    }, []);

    const toggle = useCallback(() => {
        if (isOpenRef.current) {
            void close();
            return;
        }
        open();
    }, [close, open]);

    const handleOpened = useCallback(() => {
        if (!isOpenRef.current) return;
        setIsBaseLayerFrozen(true);
    }, []);

    useEffect(() => {
        const handleOpen = () => open();
        const handleClose = () => void close();

        window.addEventListener('open-fullscreen-player', handleOpen);
        window.addEventListener('close-fullscreen-player', handleClose);
        return () => {
            window.removeEventListener('open-fullscreen-player', handleOpen);
            window.removeEventListener('close-fullscreen-player', handleClose);
        };
    }, [close, open]);

    return {
        isOpen,
        isBaseLayerFrozen,
        open,
        close,
        toggle,
        handleOpened,
    };
}
