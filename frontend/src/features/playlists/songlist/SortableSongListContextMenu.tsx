import { memo, useMemo } from 'react';
import type { SongMetadata } from '@/types';
import { useSongOperations } from '@/hooks/menu/useSongOperations';
import type { MusicMenuContext } from '@/hooks/menu/useSongOperations';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';

export type ContextMenuState = {
    x: number;
    y: number;
    type: 'single' | 'batch';
    song?: SongMetadata;
    index?: number;
    songs?: SongMetadata[];
};

interface SortableSongListContextMenuProps {
    contextMenu: ContextMenuState;
    onClose: () => void;
    toggleSelection: (id: string, type: 'song', data: SongMetadata) => void;
    toggleSelectionMode: (item: { id: string; type: 'song'; data: SongMetadata }) => void;
    isSelectionMode: boolean;
    selectedIds: Set<string>;
    playlistId?: number;
    context?: MusicMenuContext;
}

const getSelectionId = (song: SongMetadata, index?: number) => {
    if (song.unique_id !== undefined && song.unique_id !== null) return song.unique_id.toString();
    if (song.id !== undefined && song.id !== null) return index !== undefined ? `${song.id}-${index}` : song.id.toString();
    return song.path ? (index !== undefined ? `${song.path}-${index}` : song.path) : '';
};

export const SortableSongListContextMenu = memo(({
    contextMenu,
    onClose,
    toggleSelection,
    toggleSelectionMode,
    isSelectionMode,
    selectedIds,
    playlistId,
    context = 'playlist',
}: SortableSongListContextMenuProps) => {
    const items = useMemo(() => {
        if (!contextMenu) return [];
        if (contextMenu.type === 'batch') return contextMenu.songs || [];
        return contextMenu.song ? [contextMenu.song] : [];
    }, [contextMenu]);

    const { menuItems } = useSongOperations({
        items,
        context,
        playlistId,
        isSelected: contextMenu?.type === 'batch'
            ? true
            : (contextMenu?.song ? selectedIds.has(getSelectionId(contextMenu.song, contextMenu.index)) : false),
        onSelect: () => {
            if (contextMenu?.type === 'batch') {
                items.forEach((s: SongMetadata) => {
                    const id = getSelectionId(s, contextMenu.songs?.indexOf(s));
                    if (id) toggleSelection(id, 'song', s);
                });
            } else if (contextMenu?.song) {
                const id = getSelectionId(contextMenu.song, contextMenu.index);
                if (!isSelectionMode) {
                    toggleSelectionMode({ id, type: 'song', data: contextMenu.song });
                } else {
                    toggleSelection(id, 'song', contextMenu.song);
                }
            }
        },
    });

    return (
        <SmartCursorContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={onClose}
            menuGroups={menuItems}
        />
    );
});
