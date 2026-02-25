import type { SongMetadata } from '@/types';
import type { AlbumData } from '../components/AlbumGridView';
import type { ArtistData } from '../components/ArtistGridView';

const compareAlphaNum = (a: string, b: string) => {
    const isAsciiA = /^[a-zA-Z]/.test(a);
    const isAsciiB = /^[a-zA-Z]/.test(b);
    if (isAsciiA && !isAsciiB) return -1;
    if (!isAsciiA && isAsciiB) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

export function buildAlbums(librarySongs: SongMetadata[], albumSortKey: 'name' | 'artist'): AlbumData[] {
    const map = new Map<string, AlbumData>();
    librarySongs.forEach(song => {
        const key = (song.album || 'Unknown Album') + (song.artist || 'Unknown Artist');
        if (!map.has(key)) {
            map.set(key, {
                name: song.album || 'Unknown Album',
                artist: song.artist || 'Unknown Artist',
                cover: song.cover_path || null,
                cover_path: song.cover_path || null,
                songs: [],
            });
        }
        map.get(key)!.songs.push(song);
    });

    const list = Array.from(map.values());
    if (albumSortKey === 'name') {
        list.sort((a, b) => compareAlphaNum(a.name, b.name));
    } else {
        list.sort((a, b) => compareAlphaNum(a.artist, b.artist));
    }
    return list;
}

export function buildArtists(librarySongs: SongMetadata[]): ArtistData[] {
    const map = new Map<string, ArtistData>();
    librarySongs.forEach(song => {
        const artistName = song.artist || 'Unknown Artist';
        if (!map.has(artistName)) {
            map.set(artistName, {
                name: artistName,
                cover: null,
                count: 0,
                albumCount: 0,
                songs: [],
            });
        }
        const artist = map.get(artistName)!;
        artist.songs.push(song);
        artist.count += 1;

        if (!artist.cover && song.cover_path) {
            artist.cover = song.cover_path;
        }
    });

    const list = Array.from(map.values());
    list.forEach(artist => {
        const artistAlbums = new Set(artist.songs.map(s => s.album));
        artist.albumCount = artistAlbums.size;
    });

    list.sort((a, b) => compareAlphaNum(a.name, b.name));
    return list;
}
