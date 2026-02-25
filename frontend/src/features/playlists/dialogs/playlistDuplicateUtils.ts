import type { SongMetadata } from '@/types';

function normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
}

export function resolveSongsWithLibraryIds(
    inputSongs: SongMetadata[],
    librarySongs: SongMetadata[]
): SongMetadata[] {
    if (!inputSongs.some(s => !s.id && s.path)) return inputSongs;

    const byPath = new Map(
        librarySongs
            .filter(s => s.path)
            .map(s => [normalizePath(s.path as string), s])
    );

    return inputSongs.map(song => {
        if (song.id || !song.path) return song;
        const match = byPath.get(normalizePath(song.path));
        return match?.id ? { ...song, id: match.id } : song;
    });
}

export function splitDuplicateSongs(
    inputSongs: SongMetadata[],
    existingSongs: SongMetadata[]
): { duplicates: SongMetadata[]; newSongs: SongMetadata[] } {
    const existingIds = new Set(existingSongs.map(s => s.id));
    const duplicates: SongMetadata[] = [];
    const newSongs: SongMetadata[] = [];

    for (const song of inputSongs) {
        if (!song.id) continue;
        if (existingIds.has(song.id)) {
            duplicates.push(song);
        } else {
            newSongs.push(song);
        }
    }

    return { duplicates, newSongs };
}
