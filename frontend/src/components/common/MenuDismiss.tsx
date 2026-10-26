import type { RefObject } from 'react';
import { Portal } from '@headlessui/react';
import { useMenuDismiss, useMenuScrollLock } from '@/hooks/menu/useMenuDismiss';

export default function MenuDismiss({ open, menuRef, triggerRef, onClose }: {
    open: boolean;
    menuRef: RefObject<HTMLElement | null>;
    triggerRef: RefObject<HTMLElement | null>;
    onClose: () => void;
}) {
    useMenuDismiss(open, menuRef, onClose, triggerRef);
    useMenuScrollLock(open, menuRef);
    return open ? <Portal>
        <div
            className="fixed inset-0 z-9998 touch-none"
            onPointerDown={event => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
            }}
            onContextMenu={event => {
                event.preventDefault();
                onClose();
            }}
        />
    </Portal> : null;
}
