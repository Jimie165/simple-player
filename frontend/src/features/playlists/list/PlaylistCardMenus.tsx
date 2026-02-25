import MusicContextMenu from '@/components/common/MusicContextMenu';
import { useSongOperations } from '@/hooks/menu/useSongOperations';
import { getMusicItemId } from '@/utils/musicItemUtils';
import type { Playlist } from '@/types';

export function FavoritesCardMenu({
    handlePlayFavorites,
    handleAddFavoritesToQueue,
    setFavoritesContextMenu,
    setContextMenu,
    toggleSelectionMode,
    toggleSelection,
    isSelectionMode,
    isSelected
}: any) {
    const { menuItems } = useSongOperations({
        items: [{
            id: 'playlist:favorites',
            type: 'playlist',
            name: '喜爱歌曲',
            title: '喜爱歌曲'
        } as any],
        context: 'playlist_list',
        onPlay: () => handlePlayFavorites(),
        onShuffle: () => handlePlayFavorites(true),
        onAddToQueue: () => handleAddFavoritesToQueue(),
        onDelete: () => { },
        onSelect: () => {
            if (!isSelectionMode) {
                toggleSelectionMode({ id: 'playlist:favorites', type: 'playlist', data: { id: 'playlist:favorites', type: 'playlist', name: '喜爱歌曲', title: '喜爱歌曲' } });
            } else {
                toggleSelection('playlist:favorites', 'playlist', { id: 'playlist:favorites', type: 'playlist', name: '喜爱歌曲', title: '喜爱歌曲' });
            }
        },
        isSelected
    });

    return (
        <MusicContextMenu
            className="absolute bottom-3 right-3"
            buttonClassName="w-10 h-10"
            groups={menuItems}
            onOpen={() => {
                setFavoritesContextMenu(null);
                setContextMenu(null);
            }}
        />
    );
}

export function PlaylistCardMenu({
    pl,
    handlePlayPlaylist,
    handleAddToQueue,
    setEditPlaylist,
    setContextMenu,
    setFavoritesContextMenu,
    toggleSelectionMode,
    toggleSelection,
    isSelectionMode,
    isSelected
}: {
    pl: Playlist;
    handlePlayPlaylist: (pl: Playlist, shuffle?: boolean) => Promise<void>;
    handleAddToQueue: (pl: Playlist) => Promise<void>;
    setEditPlaylist: (pl: Playlist) => void;
    setContextMenu: (v: any) => void;
    setFavoritesContextMenu: (v: any) => void;
    toggleSelectionMode: (item: any) => void;
    toggleSelection: (id: string, type: 'playlist', data: Playlist) => void;
    isSelectionMode: boolean;
    isSelected: boolean;
}) {
    const selectionId = getMusicItemId(pl);
    const { menuItems } = useSongOperations({
        items: [pl],
        context: 'playlist_list',
        onPlay: () => handlePlayPlaylist(pl),
        onShuffle: () => handlePlayPlaylist(pl, true),
        onAddToQueue: () => handleAddToQueue(pl),
        onEdit: () => setEditPlaylist(pl),
        onSelect: () => {
            if (!isSelectionMode) {
                toggleSelectionMode({ id: selectionId, type: 'playlist', data: pl });
            } else {
                toggleSelection(selectionId, 'playlist', pl);
            }
        },
        isSelected
    });

    return (
        <MusicContextMenu
            className="absolute bottom-3 right-3"
            buttonClassName="w-10 h-10"
            groups={menuItems}
            onOpen={() => {
                setContextMenu(null);
                setFavoritesContextMenu(null);
            }}
        />
    );
}
