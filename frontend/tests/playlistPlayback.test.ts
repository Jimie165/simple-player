import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { libraryService } from '@/services/libraryService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { loadPlaylistSongsInSavedOrder, resolveSongsFromItems } from '@/utils/musicItemUtils';
import type { SongMetadata } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));

const songs: SongMetadata[] = ['B', 'A'].map(title => ({ title, artist: '', album: '', duration: 10, path: `${title}.flac` }));

describe('playlist playback order and source replacement', () => {
    beforeEach(() => {
        useLibraryStore.setState(useLibraryStore.getInitialState());
        vi.spyOn(libraryService, 'getPlaylistSongs').mockResolvedValue(songs);
        vi.spyOn(libraryService, 'getFavorites').mockResolvedValue(songs);
    });
    afterEach(() => vi.restoreAllMocks());

    it('uses the saved title order for playback and context-menu song resolution', async () => {
        useLibraryStore.setState({ playlistSettings: { '7': { sortKey: 'title', sortOrder: 'asc' } } });
        expect((await loadPlaylistSongsInSavedOrder(7)).map(song => song.title)).toEqual(['A', 'B']);
        expect((await resolveSongsFromItems([{ id: 'playlist:7', type: 'playlist' }])).map(song => song.title)).toEqual(['A', 'B']);
        expect(songs.map(song => song.title)).toEqual(['B', 'A']);
    });

    it('reverses a manual playlist but does not reverse backend-ordered favorites twice', async () => {
        useLibraryStore.setState({ playlistSettings: {
            '7': { sortKey: 'manual', sortOrder: 'desc' },
            favorites: { sortKey: 'manual', sortOrder: 'desc' },
        } });
        expect(await loadPlaylistSongsInSavedOrder(7)).toEqual([...songs].reverse());
        expect(await loadPlaylistSongsInSavedOrder('favorites')).toEqual(songs);
        expect(libraryService.getFavorites).toHaveBeenCalledWith('desc');
    });

    it('sorts favorites by title independently of their saved insertion order', async () => {
        useLibraryStore.setState({ playlistSettings: { favorites: { sortKey: 'title', sortOrder: 'asc' } } });
        expect((await loadPlaylistSongsInSavedOrder('favorites')).map(song => song.title)).toEqual(['A', 'B']);
        expect(libraryService.getFavorites).toHaveBeenCalledWith('asc');
    });

    it('publishes a new source queue and its context atomically without inherited manual flags', () => {
        const manualSong = { ...songs[0], is_queue_item: true };
        useLibraryStore.setState({ queueContext: { type: 'album_detail', name: 'Old' } });
        const observed: Array<{ title: string; source: string | undefined }> = [];
        const unsubscribe = useLibraryStore.subscribe(state => observed.push({
            title: state.playlist[0].title, source: state.queueContext?.name,
        }));
        try {
            useLibraryStore.getState().setPlaylist([manualSong], { type: 'playlist_detail', name: 'New' });
            expect(observed).toEqual([{ title: 'B', source: 'New' }]);
            expect(useLibraryStore.getState().playlist[0].is_queue_item).toBeUndefined();
            expect(manualSong.is_queue_item).toBe(true);
            useLibraryStore.getState().setPlaylist([songs[1]], null);
            expect(observed[1]).toEqual({ title: 'A', source: undefined });
        } finally {
            unsubscribe();
        }
    });
});
