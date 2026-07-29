import MusicContextMenu from '@/components/common/MusicContextMenu';
import { useSongOperations } from '@/hooks/menu/useSongOperations';
import { getMusicItemId } from '@/utils/musicItemUtils';
import type { Playlist } from '@/types';
import type { MusicItem } from '@/utils/musicItemUtils';

type FavoritesPlaylist = Omit<Playlist, 'id'> & { id: 'favorites' | 'playlist:favorites'; type: 'playlist'; title: string };
type PlaylistContextMenu = { x: number; y: number; playlist: Playlist } | null;
type FavoritesContextMenu = { x: number; y: number } | null;

interface FavoritesCardMenuProps {
    handlePlayFavorites: (shuffle?: boolean) => void;
    handleAddFavoritesToQueue: () => void;
    setFavoritesContextMenu: (value: FavoritesContextMenu) => void;
    setContextMenu: (value: PlaylistContextMenu) => void;
    toggleSelectionMode: (item: { id: string; type: 'playlist'; data: unknown }) => void;
    toggleSelection: (id: string, type: 'playlist', data: unknown) => void;
    isSelectionMode: boolean;
    isSelected: boolean;
}

export function FavoritesCardMenu({
    handlePlayFavorites,
    handleAddFavoritesToQueue,
    setFavoritesContextMenu,
    setContextMenu,
    toggleSelectionMode,
    toggleSelection,
    isSelectionMode,
    isSelected
}: FavoritesCardMenuProps) {
    const favoritesItem: FavoritesPlaylist = {
        id: 'playlist:favorites',
        type: 'playlist',
        name: '喜爱歌曲',
        title: '喜爱歌曲',
        description: null,
        cover_path: null,
        created_at: '',
        updated_at: '',
    };
    const { menuItems } = useSongOperations({
        items: [favoritesItem as unknown as MusicItem],
        context: 'playlist_list',
        onPlay: () => handlePlayFavorites(),
        onShuffle: () => handlePlayFavorites(true),
        onAddToQueue: () => handleAddFavoritesToQueue(),
        onDelete: () => undefined,
        onSelect: () => {
            if (!isSelectionMode) {
                toggleSelectionMode({ id: 'playlist:favorites', type: 'playlist', data: favoritesItem });
            } else {
                toggleSelection('playlist:favorites', 'playlist', favoritesItem);
            }
        },
        isSelected
    });

    return (
        <MusicContextMenu
            className="absolute bottom-3 right-3"
            buttonClassName="w-10 h-10"
            tooltipText="更多"
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
    setContextMenu: (v: PlaylistContextMenu) => void;
    setFavoritesContextMenu: (v: FavoritesContextMenu) => void;
    toggleSelectionMode: (item: { id: string; type: 'playlist'; data: unknown }) => void;
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
            tooltipText="更多"
            groups={menuItems}
            onOpen={() => {
                setContextMenu(null);
                setFavoritesContextMenu(null);
            }}
        />
    );
}
