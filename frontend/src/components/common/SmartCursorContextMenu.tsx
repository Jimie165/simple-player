import { useMemo } from 'react';
import CursorContextMenu from '@/components/common/CursorContextMenu';
import type { MusicMenuContext, MenuItemData } from '@/hooks/menu/useSongOperations';
import { useSongOperations } from '@/hooks/menu/useSongOperations';
import { getMusicItemId, getMusicItemType } from '@/utils/musicItemUtils';
import type { MusicItem } from '@/utils/musicItemUtils';
import { useSelectionStore } from '@/store/useSelectionStore';

type SelectionType = 'song' | 'album' | 'artist' | 'folder' | 'file' | 'recent' | 'playlist' | 'video';
const selectionTypes: SelectionType[] = ['song', 'album', 'artist', 'folder', 'file', 'recent', 'playlist', 'video'];

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
    onShowProperties?: () => void;
    isSelected?: boolean;
    hideSelect?: boolean;
    selectText?: string;
    onNavigate?: () => void;
    menuGroups?: MenuItemData[][];
    extraGroups?: MenuItemData[][];
    variant?: 'default' | 'apple';
    placement?: 'auto' | 'top' | 'bottom';
}

/**
 * Smart Right-Click Context Menu
 * Automatically handles selection logic:
 * 1. If right-clicking a selected item, operate on all selected items (batch).
 * 2. If right-clicking an unselected item, operate on just that item (single).
 * Uses Portal and viewport boundary detection.
 */
export default function SmartCursorContextMenu(props: SmartCursorContextMenuProps) {
    const { x, y, item, context = 'other', playlistId, onClose, onPlay, onEdit, onDelete, onShuffle, onSelect: onSelectProp, onShowProperties, isSelected: isSelectedProp, hideSelect, selectText, onNavigate, menuGroups, extraGroups, variant = 'default', placement = 'auto' } = props;

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
    const selectionType = selectionTypes.includes(resolvedType as SelectionType)
        ? (resolvedType as SelectionType)
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
        hideSelect,
        selectText,
        onNavigate,
        onShowProperties,
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

    const baseGroups = menuGroups ?? menuItems;
    const resolvedGroups = extraGroups && extraGroups.length > 0
        ? [...baseGroups, ...extraGroups]
        : baseGroups;

    if (!resolvedGroups || resolvedGroups.length === 0) return null;

    return <CursorContextMenu x={x} y={y} menuGroups={resolvedGroups} onClose={onClose} variant={variant} placement={placement} />;
}
