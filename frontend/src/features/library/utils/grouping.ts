import type { SongMetadata } from '@/types';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type { ArtistData } from '@/features/library/components/ArtistGridView';

const compareAlphaNum = (a: string, b: string) => {
    const isAsciiA = /^[a-zA-Z]/.test(a);
    const isAsciiB = /^[a-zA-Z]/.test(b);
    if (isAsciiA && !isAsciiB) return -1;
    if (!isAsciiA && isAsciiB) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

const UNKNOWN_ALBUM = 'Unknown Album';
const UNKNOWN_ARTIST = 'Unknown Artist';

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function getAlbumDisplayArtist(songs: SongMetadata[]): string {
    const albumArtists = new Set(songs.map(song => song.album_artist?.trim()).filter(Boolean));
    const trackArtists = new Set(songs.map(song => song.artist?.trim()).filter(Boolean));
    if (albumArtists.size === 1) return Array.from(albumArtists)[0]!;
    if (trackArtists.size === 1) return Array.from(trackArtists)[0]!;
    return 'Various Artists';
}

export function songMatchesAlbum(song: SongMetadata, albumName: string, albumArtist?: string): boolean {
    const songAlbum = song.album?.trim() || UNKNOWN_ALBUM;
    if (normalize(songAlbum) !== normalize(albumName)) return false;
    if (songAlbum !== UNKNOWN_ALBUM) return true;
    return normalize(song.artist?.trim() || UNKNOWN_ARTIST) === normalize(albumArtist || UNKNOWN_ARTIST);
}

export function buildAlbums(librarySongs: SongMetadata[], albumSortKey: 'name' | 'artist'): AlbumData[] {
    const map = new Map<string, SongMetadata[]>();
    librarySongs.forEach(song => {
        const albumName = song.album?.trim() || UNKNOWN_ALBUM;
        // Track artists commonly differ on compilations and collaborations. A
        // named album is therefore identified by its album name, not by each
        // track's artist. Keep untagged tracks separated by artist so every
        // unknown song is not collapsed into one giant album.
        const key = albumName === UNKNOWN_ALBUM
            ? `${albumName}\0${normalize(song.artist?.trim() || UNKNOWN_ARTIST)}`
            : normalize(albumName);
        const songs = map.get(key) ?? [];
        songs.push(song);
        map.set(key, songs);
    });

    const list = Array.from(map.values(), songs => {
        const first = songs[0];
        const coverPath = songs.find(song => song.cover_path)?.cover_path || null;

        return {
            name: first.album?.trim() || UNKNOWN_ALBUM,
            artist: getAlbumDisplayArtist(songs),
            cover: coverPath,
            cover_path: coverPath,
            songs,
        };
    });
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
