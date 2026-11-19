import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/store/useLibraryStore';
import { albumRecentItem, resolveSongsFromItems } from '@/utils/musicItemUtils';
import { artistRecentItem, playlistSnapshotItem } from '@/utils/recentCollections';
import type { SongMetadata } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));

const song = (name: string): SongMetadata => ({
    title: name, artist: 'Artist', album: 'Album', duration: 10, path: `${name}.flac`, cover_path: `cache/${name}.jpg`,
});
const [a, b, c] = ['a', 'b', 'c'].map(song);
const context = { type: 'artist_detail', name: 'Artist', id: 'Artist' };

describe('recent collection items', () => {
    beforeEach(() => useLibraryStore.setState(useLibraryStore.getInitialState()));

    it('keeps the original order and drops transient song data', async () => {
        const item = playlistSnapshotItem([{ ...a, cover: 'data:x', lyrics_text: 'la', is_queue_item: true }, b, c], context);
        expect(item.songs?.[0]).not.toHaveProperty('cover');
        expect(item.songs?.[0]).not.toHaveProperty('lyrics_text');
        expect(item.songs?.[0]).not.toHaveProperty('is_queue_item');
        expect((await resolveSongsFromItems([item])).map(s => s.path)).toEqual(['a.flac', 'b.flac', 'c.flac']);
    });

    it('gives different selections from the same page different ids and the same selection one id', () => {
        expect(playlistSnapshotItem([a, b], context).id).not.toBe(playlistSnapshotItem([a, c], context).id);
        expect(playlistSnapshotItem([a, b], context).id).toBe(playlistSnapshotItem([a, b], context).id);
    });

    it('persists artist entries and replays their songs', async () => {
        useLibraryStore.getState().addToRecent(artistRecentItem('Artist', [a, b], 'cache/portrait.jpg'));
        const [recent] = useLibraryStore.getState().recentHistory;
        expect([recent.type, recent.id, recent.cover_path]).toEqual(['artist', 'artist:Artist', 'cache/portrait.jpg']);
        expect((await resolveSongsFromItems([recent])).map(s => s.path)).toEqual(['a.flac', 'b.flac']);
    });

    it('records an album with its cover', () => {
        expect(albumRecentItem('Album', 'Artist', [a, b]).cover_path).toBe('cache/a.jpg');
    });
});
