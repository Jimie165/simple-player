import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useMenuDismiss(
    open: boolean,
    menuRef: RefObject<HTMLElement | null>,
    onClose: () => void,
    triggerRef?: RefObject<HTMLElement | null>,
) {
    useEffect(() => {
        if (!open) return;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (menuRef.current?.contains(target) || triggerRef?.current?.contains(target)) return;
            onClose();
        };
        const handleCloseMenus = (event: Event) => {
            if (event instanceof CustomEvent && triggerRef?.current && event.detail === triggerRef.current) return;
            onClose();
        };
        // Capture also sees clicks stopped by rows, overlays, or other menu triggers.
        document.addEventListener('pointerdown', handlePointerDown, true);
        window.addEventListener('resize', onClose);
        window.addEventListener('app:close-cursor-menus', handleCloseMenus);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('resize', onClose);
            window.removeEventListener('app:close-cursor-menus', handleCloseMenus);
        };
    }, [open, menuRef, onClose, triggerRef]);
}
