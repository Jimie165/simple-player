import type { SortKey, SortOrder } from '@/utils/songSort';

export interface SongListSorting {
    key: SortKey | null;
    order: SortOrder;
}

export function readSongListSorting(): SongListSorting {
    try {
        const key = localStorage.getItem('songlist_sort_key');
        const order = localStorage.getItem('songlist_sort_order');
        return {
            key: key === 'title' || key === 'artist' || key === 'album' || key === 'duration' ? key : null,
            order: order === 'desc' ? 'desc' : 'asc',
        };
    } catch (error) {
        console.warn('Failed to read song list sorting', error);
        return { key: null, order: 'asc' };
    }
}

export function persistSongListSorting(sorting: SongListSorting) {
    try {
        if (sorting.key) localStorage.setItem('songlist_sort_key', sorting.key);
        else localStorage.removeItem('songlist_sort_key');
        localStorage.setItem('songlist_sort_order', sorting.order);
    } catch (error) {
        console.warn('Failed to persist song list sorting', error);
    }
}

export function changeSongListSorting(sorting: SongListSorting, change: { key: SortKey } | { order: SortOrder }): SongListSorting {
    if ('order' in change) {
        return { key: sorting.key, order: change.order };
    }
    if (sorting.key === change.key && sorting.order === 'desc') {
        return { key: null, order: 'asc' };
    }
    return {
        key: change.key,
        order: sorting.key === change.key && sorting.order === 'asc' ? 'desc' : 'asc',
    };
}
