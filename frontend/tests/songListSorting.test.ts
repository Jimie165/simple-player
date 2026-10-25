import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeSongListSorting, persistSongListSorting, readSongListSorting } from '@/features/library/utils/songListSorting';

describe('song list sorting preference', () => {
    beforeEach(() => {
        const values = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
            clear: () => values.clear(),
        });
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('reads supported keys and defaults invalid values safely', () => {
        localStorage.setItem('songlist_sort_key', 'artist');
        localStorage.setItem('songlist_sort_order', 'desc');
        expect(readSongListSorting()).toEqual({ key: 'artist', order: 'desc' });
        localStorage.setItem('songlist_sort_key', 'manual');
        localStorage.setItem('songlist_sort_order', 'sideways');
        expect(readSongListSorting()).toEqual({ key: null, order: 'asc' });
    });

    it('cycles a selected key through ascending, descending and manual order', () => {
        const asc = changeSongListSorting({ key: null, order: 'asc' }, { key: 'title' });
        const desc = changeSongListSorting(asc, { key: 'title' });
        expect(asc).toEqual({ key: 'title', order: 'asc' });
        expect(desc).toEqual({ key: 'title', order: 'desc' });
        expect(changeSongListSorting(desc, { key: 'title' })).toEqual({ key: null, order: 'asc' });
    });

    it('persists and clears the key while retaining the chosen order', () => {
        persistSongListSorting({ key: 'album', order: 'desc' });
        expect(readSongListSorting()).toEqual({ key: 'album', order: 'desc' });
        persistSongListSorting({ key: null, order: 'asc' });
        expect(readSongListSorting()).toEqual({ key: null, order: 'asc' });
    });
});
