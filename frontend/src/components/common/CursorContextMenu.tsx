import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MenuItemData } from '../../hooks/useSongOperations';

interface CursorContextMenuProps {
    x: number;
    y: number;
    menuGroups: MenuItemData[][];
    onClose: () => void;
}

export default function CursorContextMenu({ x, y, menuGroups, onClose }: CursorContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: y, left: x });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };
        // Use mousedown to capture click outside quickly
        document.addEventListener('mousedown', handleClickOutside);

        // Handle window resize
        const handleResize = () => onClose();
        window.addEventListener('resize', handleResize);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', handleResize);
        };
    }, [onClose]);

    // Smart Positioning Logic
    useEffect(() => {
        if (ref.current) {
            const menuRect = ref.current.getBoundingClientRect();
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            let newTop = y;
            let newLeft = x;

            // Check horizontal overflow (right)
            if (x + menuRect.width > windowWidth) {
                newLeft = x - menuRect.width; // Flip to left
            }

            // Check vertical overflow (bottom)
            if (y + menuRect.height > windowHeight) {
                newTop = y - menuRect.height; // Flip to top
            }

            // Constrain left to 0 (don't go off-screen left)
            if (newLeft < 0) newLeft = 0;
            // Constrain top to 0 (don't go off-screen top)
            if (newTop < 0) newTop = 0;

            setPosition({ top: newTop, left: newLeft });
        }
    }, [x, y, menuGroups]);

    // Render using Portal to document.body
    return createPortal(
        <div
            ref={ref}
            className="fixed z-[9999] w-56 rounded-xl border border-neutral-200/30 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-3xl backdrop-saturate-150 p-1 text-sm text-neutral-900 shadow-2xl dark:border-white/10 dark:text-white pointer-events-auto"
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()} // Prevent triggering other clicks
            onContextMenu={(e) => e.preventDefault()} // Prevent browser context menu on the menu itself
        >
            {menuGroups.map((group, groupIndex) => (
                <div key={groupIndex}>
                    {groupIndex > 0 && <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />}
                    {group.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => {
                                item.onClick();
                                onClose();
                            }}
                            className={`group flex w-full items-center gap-3 rounded-lg py-2 px-3 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-white/10 ${item.variant === 'danger'
                                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                : ''
                                }`}
                        >
                            <div className="flex flex-1 items-center gap-3">
                                <item.icon className="text-lg opacity-70" />
                                {item.label}
                            </div>
                            {item.suffix}
                        </button>
                    ))}
                </div>
            ))}
        </div>,
        document.body
    );
}
