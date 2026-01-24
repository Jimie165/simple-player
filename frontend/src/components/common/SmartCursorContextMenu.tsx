import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Portal } from '@headlessui/react';
import type { MusicMenuContext, MenuItemData } from '../../hooks/useSongOperations';
import { useSongOperations } from '../../hooks/useSongOperations';
import { getMusicItemId, getMusicItemType } from '../../utils/musicItemUtils';
import type { MusicItem } from '../../utils/musicItemUtils';
import { useSelectionStore } from '../../store/useSelectionStore';

interface SmartCursorContextMenuProps {
    x: number;
    y: number;
    item?: MusicItem; // The item that triggered the right-click
    context?: MusicMenuContext;
    playlistId?: number;
    onClose: () => void;
    onPlay?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onShuffle?: () => void;
    onSelect?: () => void;
    isSelected?: boolean;
    menuGroups?: MenuItemData[][];
    extraGroups?: MenuItemData[][];
}

/**
 * Smart Right-Click Context Menu
 * Automatically handles selection logic:
 * 1. If right-clicking a selected item, operate on all selected items (batch).
 * 2. If right-clicking an unselected item, operate on just that item (single).
 * Uses Portal and viewport boundary detection.
 */
export default function SmartCursorContextMenu(props: SmartCursorContextMenuProps) {
    const { x, y, item, context = 'other', playlistId, onClose, onPlay, onEdit, onDelete, onShuffle, onSelect: onSelectProp, isSelected: isSelectedProp, menuGroups, extraGroups } = props;

    // Store
    const { selectedIds, toggleSelectionMode, clearSelection } = useSelectionStore();

    // Check if clicking on an already selected item
    const itemId = item ? getMusicItemId(item) : '';
    // Use prop isSelected if provided, otherwise derive it
    const isSelected = isSelectedProp !== undefined ? isSelectedProp : (itemId ? selectedIds.has(itemId) : false);

    // Determine Target Items
    const targetItems = useMemo(() => {
        if (!item) return [] as MusicItem[];
        // If external logic says it's NOT selected, treat as single even if ID matches ?
        // Usually prop isSelected matches store, but let's trust prop if given.
        if (isSelected && selectedIds.size > 1) {
            const { selectedItemsMap } = useSelectionStore.getState();
            if (selectedItemsMap) {
                return Array.from(selectedIds).map(id => selectedItemsMap.get(id)).filter(Boolean) as MusicItem[];
            }
            return [item];
        }
        return [item];
    }, [isSelected, selectedIds, item]);

    const resolvedType = item ? getMusicItemType(item) : 'song';
    const selectionType = (['song', 'album', 'artist', 'folder', 'file', 'recent', 'playlist'] as string[]).includes(resolvedType)
        ? (resolvedType as any)
        : 'song';

    // Hook to get menu items
    const { menuItems } = useSongOperations({
        items: targetItems,
        context,
        playlistId,
        onPlay,
        onEdit,
        onDelete,
        onShuffle,
        isSelected,
        onSelect: onSelectProp ? onSelectProp : () => {
            if (!item) return;
            if (isSelected && targetItems.length > 1) {
                clearSelection();
            } else {
                const id = getMusicItemId(item);
                if (id) toggleSelectionMode({ id, type: selectionType, data: item });
            }
            onClose();
        },
    });

    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: y, left: x, opacity: 0 });

    // Handle closing on click outside or events
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        window.addEventListener('scroll', onClose, true);
        window.addEventListener('resize', onClose);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
            window.removeEventListener('scroll', onClose, true);
            window.removeEventListener('resize', onClose);
        };
    }, [onClose]);

    // Re-position when measured
    useEffect(() => {
        const baseGroups = menuGroups ?? menuItems;
        if (!menuRef.current || baseGroups.length === 0) return;

        const raf = requestAnimationFrame(() => {
            if (!menuRef.current) return;
            const menuRect = menuRef.current.getBoundingClientRect();
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const padding = 12;

            let newTop = y;
            let newLeft = x;

            if (x + menuRect.width > windowWidth - padding) {
                newLeft = x - menuRect.width;
            }
            if (y + menuRect.height > windowHeight - padding) {
                newTop = y - menuRect.height;
            }

            if (newLeft < padding) newLeft = padding;
            if (newTop < padding) newTop = padding;

            setPosition({ top: newTop, left: newLeft, opacity: 1 });
        });

        return () => cancelAnimationFrame(raf);
    }, [x, y, menuItems, menuGroups]);

    const baseGroups = menuGroups ?? menuItems;
    const resolvedGroups = extraGroups && extraGroups.length > 0
        ? [...baseGroups, ...extraGroups]
        : baseGroups;

    if (!resolvedGroups || resolvedGroups.length === 0) return null;

    return (
        <Portal>
            <div
                ref={menuRef}
                className="fixed z-[9999] w-56 rounded-xl border border-neutral-200/50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-1 text-sm text-neutral-900 shadow-2xl ring-1 ring-black/5 dark:border-neutral-700/50 dark:text-white transition-opacity duration-150"
                style={{
                    top: position.top,
                    left: position.left,
                    opacity: position.opacity,
                    pointerEvents: position.opacity === 0 ? 'none' : 'auto'
                }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                {resolvedGroups.map((group, groupIndex) => (
                    <React.Fragment key={groupIndex}>
                        {groupIndex > 0 && <div className="my-1 h-0.5 bg-neutral-200/50 dark:bg-white/20" />}
                        {group.map((mItem) => (
                            <button
                                key={mItem.id}
                                onClick={() => {
                                    mItem.onClick();
                                    onClose();
                                }}
                                className={`group flex w-full items-center gap-3 rounded-lg py-2 px-3 hover:bg-neutral-100 dark:hover:bg-white/10 ${mItem.variant === 'danger'
                                    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                    : 'text-neutral-900 dark:text-neutral-200'
                                    }`}
                            >
                                <div className="flex flex-1 items-center gap-3">
                                    {mItem.icon && <mItem.icon className="text-lg opacity-70" />}
                                    {mItem.label}
                                </div>
                                {mItem.suffix}
                            </button>
                        ))}
                    </React.Fragment>
                ))}
            </div>
        </Portal>
    );
}
