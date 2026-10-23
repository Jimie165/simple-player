import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MenuItemData } from '@/hooks/menu/useSongOperations';
import { MenuSurface, MenuEntries } from '@/components/common/MenuSurface';
import { useMenuDismiss } from '@/hooks/menu/useMenuDismiss';

interface CursorContextMenuProps {
    x: number;
    y: number;
    menuGroups: MenuItemData[][];
    onClose: () => void;
    variant?: 'default' | 'apple';
    placement?: 'auto' | 'top' | 'bottom';
}

export default function CursorContextMenu({ x, y, menuGroups, onClose, variant = 'default', placement = 'auto' }: CursorContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: y, left: x });

    useMenuDismiss(true, ref, onClose);

    // Smart Positioning Logic
    useEffect(() => {
        if (ref.current) {
            const menuRect = { width: ref.current.offsetWidth, height: ref.current.offsetHeight };
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            let newTop = y;
            let newLeft = x;

            // Check horizontal overflow (right)
            if (x + menuRect.width > windowWidth) {
                newLeft = x - menuRect.width; // Flip to left
            }

            // Check vertical overflow (bottom)
            if (placement === 'top' || (placement === 'auto' && y + menuRect.height > windowHeight)) {
                newTop = y - menuRect.height; // Flip to top
            }

            // Constrain left to 0 (don't go off-screen left)
            if (newLeft < 0) newLeft = 0;
            // Constrain top to 0 (don't go off-screen top)
            if (newTop < 0) newTop = 0;

            const frame = requestAnimationFrame(() => {
                setPosition({ top: newTop, left: newLeft });
            });
            return () => cancelAnimationFrame(frame);
        }
    }, [x, y, menuGroups, placement]);

    // Render using Portal to document.body
    return createPortal(
        <>
            <div
                className="fixed inset-0 z-9998"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => {
                    e.preventDefault();
                    onClose();
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    onClose();
                }}
                onWheel={(e) => {
                    e.preventDefault();
                }}
            />
            <MenuSurface
                ref={ref}
                variant={variant}
                data-menu-portal="true"
                style={{ top: position.top, left: position.left }}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => event.stopPropagation()}
                onContextMenu={event => event.preventDefault()}
            >
                <MenuEntries groups={menuGroups} onClose={onClose} variant={variant} />
            </MenuSurface>
        </>,
        document.body
    );
}
