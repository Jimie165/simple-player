import { fileService } from '@/services/fileService';
import { getMusicItemType, resolveSongsFromItems } from '@/utils/musicItemUtils';
import type { SongMetadata } from '@/types';
import type { MusicItem } from '@/utils/musicItemUtils';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type { ArtistData } from '@/features/library/components/ArtistGridView';

type NavigationView =
    | { type: 'album_detail'; data: Partial<AlbumData> }
    | { type: 'artist_detail'; data: ArtistData };

function getRecord(item: MusicItem): Record<string, unknown> {
    return item as unknown as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

interface HandleShowAlbumActionParams {
    isSingle: boolean;
    firstItem?: MusicItem;
    clearSelection: () => void;
    push: (value: NavigationView) => void;
    onNavigate?: () => void;
}

export async function handleShowAlbumAction({
    isSingle,
    firstItem,
    clearSelection,
    push,
    onNavigate,
}: HandleShowAlbumActionParams) {
    if (!isSingle || !firstItem) return;
    const item = getRecord(firstItem);
    const type = getMusicItemType(firstItem);

    let albumName: string | undefined;
    if (item?.album) {
        albumName = stringValue(item.album);
    } else if (type === 'album') {
        albumName = stringValue(item.name) || stringValue(item.title);
    }

    if (!albumName && item.path) {
        const songs = await resolveSongsFromItems([firstItem]);
        if (songs.length > 0) albumName = songs[0].album;
    }

    if (albumName) {
        clearSelection();
        push({
            type: 'album_detail',
            data: {
                name: albumName,
                artist: stringValue(item.artist),
                songs: [],
                cover: stringValue(item.cover_path) || null,
            },
        });
        onNavigate?.();
    }
}

interface HandleShowArtistActionParams {
    isSingle: boolean;
    firstItem?: MusicItem;
    clearSelection: () => void;
    push: (value: NavigationView) => void;
    onNavigate?: () => void;
}

export function handleShowArtistAction({
    isSingle,
    firstItem,
    clearSelection,
    push,
    onNavigate,
}: HandleShowArtistActionParams) {
    if (!isSingle || !firstItem) return;
    const item = getRecord(firstItem);
    const type = getMusicItemType(firstItem);
    const artist = stringValue(item.artist) || (type === 'artist' ? stringValue(item.name) : undefined);
    if (artist) {
        clearSelection();
        push({ type: 'artist_detail', data: { name: artist, count: 0, albumCount: 0, songs: [], cover: null } });
        onNavigate?.();
    }
}

interface HandlePropertiesActionParams {
    onShowProperties?: () => void;
    isSingle: boolean;
    firstItem?: MusicItem;
    openProperties: (song: SongMetadata) => void;
}

export async function handlePropertiesAction({
    onShowProperties,
    isSingle,
    firstItem,
    openProperties,
}: HandlePropertiesActionParams) {
    if (onShowProperties) {
        onShowProperties();
        return;
    }

    if (!isSingle || !firstItem) return;
    let songToCheck = firstItem as SongMetadata;
    const item = getRecord(firstItem);
    if (getMusicItemType(firstItem) === 'file' && typeof item.path === 'string') {
        try {
            const meta = await fileService.getMetadata(item.path);
            if (meta) songToCheck = meta;
        } catch (error) {
            console.warn(`Failed to fetch metadata for ${item.path}`, error);
        }
    }
    openProperties(songToCheck);
}
