import type { SongMetadata } from '@/types';

export type SortKey = 'manual' | 'title' | 'artist' | 'album' | 'duration';
export type SortOrder = 'asc' | 'desc';

export function sortSongs(songs: SongMetadata[], sortKey: SortKey, sortOrder: SortOrder): SongMetadata[] {
    if (sortKey === 'manual') {
        return sortOrder === 'asc' ? songs : [...songs].reverse();
    }

    return [...songs].sort((a, b) => {
        const key = sortKey as keyof SongMetadata;
        let valA = a[key];
        let valB = b[key];

        // Handle Duration separately
        if (sortKey === 'duration') {
            const numA = typeof valA === 'number' ? valA : 0;
            const numB = typeof valB === 'number' ? valB : 0;
            return sortOrder === 'asc' ? numA - numB : numB - numA;
        }

        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';

        if (typeof valA === 'string' && typeof valB === 'string') {
            const isAsciiA = valA.length > 0 && valA.charCodeAt(0) <= 0x7F;
            const isAsciiB = valB.length > 0 && valB.charCodeAt(0) <= 0x7F;

            if (isAsciiA && !isAsciiB) return sortOrder === 'asc' ? -1 : 1;
            if (!isAsciiA && isAsciiB) return sortOrder === 'asc' ? 1 : -1;

            return sortOrder === 'asc'
                ? valA.localeCompare(valB, 'zh-CN', { numeric: true, sensitivity: 'base' })
                : valB.localeCompare(valA, 'zh-CN', { numeric: true, sensitivity: 'base' });
        }

        // Default fallback
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });
}
