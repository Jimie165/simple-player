import type { SongMetadata } from '@/types';

import { libraryService } from '@/services/libraryService';
import { usePlayerStore } from '@/store/usePlayerStore';

type PlayerStoreUpdate = Partial<{
    pathMap: Map<string, number>;
    favoriteSet: Set<number>;
    favoritesLoaded: boolean;
    playlist: SongMetadata[];
    originalPlaylist: SongMetadata[];
}>;

export function isFavoriteFn(
    favoriteSet: Set<number>,
    pathMap: Map<string, number>,
    song: SongMetadata | { id?: number | string; path?: string }
): boolean {
    if (song.id && typeof song.id === 'number') return favoriteSet.has(song.id);
    if (song.path) {
        const normalizedPath = song.path.replace(/[\\/]/g, '/').toLowerCase();
        const id = pathMap.get(normalizedPath);
        if (id) return favoriteSet.has(id);
    }
    return false;
}

export async function refreshFavoritesFn(pathMap: Map<string, number>) {
    const favorites = await libraryService.getFavorites();
    const ids = new Set(favorites.map(song => song.id).filter((id): id is number => id !== undefined));

    let nextPathMap = pathMap;
    if (nextPathMap.size === 0) {
        const allSongs = await libraryService.getLibrarySongs();
        nextPathMap = new Map<string, number>();
        allSongs.forEach(song => {
            if (song.path && song.id) nextPathMap.set(song.path.replace(/[\\/]/g, '/').toLowerCase(), song.id);
        });
    }

    return { favoriteSet: ids, pathMap: nextPathMap };
}

export async function toggleFavoriteFn(
    song: SongMetadata,
    get: () => {
        pathMap: Map<string, number>;
        playlist: SongMetadata[];
        originalPlaylist: SongMetadata[];
        triggerLibraryUpdate: () => void;
        refreshFavorites: () => Promise<void>;
    },
    set: (updater: PlayerStoreUpdate | ((state: { pathMap: Map<string, number>; favoriteSet: Set<number> }) => PlayerStoreUpdate)) => void
): Promise<void> {
    let songId: number | undefined;
    const songPath = song.path;

    if (song.id && typeof song.id === 'number') {
        songId = song.id;
    } else if (songPath) {
        const normalizedPath = songPath.replace(/[\\/]/g, '/').toLowerCase();
        songId = get().pathMap.get(normalizedPath);

        if (!songId) {
            try {
                const allSongs = await libraryService.getLibrarySongs();
                const found = allSongs.find(item => {
                    if (!item.path) return false;
                    const normalized = item.path.replace(/[\\/]/g, '/').toLowerCase();
                    return normalized === normalizedPath && typeof item.id === 'number';
                });
                if (found?.id && typeof found.id === 'number') {
                    songId = found.id;
                    set((state: { pathMap: Map<string, number> }) => {
                        const newMap = new Map(state.pathMap);
                        newMap.set(normalizedPath, found.id as number);
                        return { pathMap: newMap };
                    });
                }
            } catch {
                return;
            }
        }
    }

    if (!songId) return;

    const newStatus = await libraryService.toggleFavorite(songId);

    set((state: { favoriteSet: Set<number> }) => {
        const newFavoriteSet = new Set(state.favoriteSet);
        if (newStatus) {
            newFavoriteSet.add(songId);
        } else {
            newFavoriteSet.delete(songId);
        }
        return { favoriteSet: newFavoriteSet, favoritesLoaded: true };
    });

    get().triggerLibraryUpdate();

    const { playlist, originalPlaylist } = get();

    const updateList = (list: SongMetadata[]) => list.map(item =>
        (item.id === songId || (songPath && item.path === songPath))
            ? { ...item, is_favorite: newStatus }
            : item
    );

    set({
        playlist: updateList(playlist),
        originalPlaylist: updateList(originalPlaylist)
    });

    const playerMetadata = usePlayerStore.getState().metadata;
    if (playerMetadata && (playerMetadata.id === songId || (songPath && playerMetadata.path === songPath))) {
        usePlayerStore.getState().setMetadata({ ...playerMetadata, is_favorite: newStatus });
    }

    get().refreshFavorites();
}
