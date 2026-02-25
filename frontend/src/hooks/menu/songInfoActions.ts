import { fileService } from '@/services/fileService';
import { getMusicItemType, resolveSongsFromItems } from '@/utils/musicItemUtils';
import type { SongMetadata } from '@/types';
import type { MusicItem } from '@/utils/musicItemUtils';

interface HandleShowAlbumActionParams {
    isSingle: boolean;
    firstItem?: MusicItem;
    clearSelection: () => void;
    push: (value: any) => void;
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
    const item = firstItem as any;
    const type = getMusicItemType(firstItem);

    let albumName: string | undefined;
    if (item?.album) {
        albumName = item.album;
    } else if (type === 'album') {
        albumName = item?.name || item?.title;
    }

    if (!albumName && item?.path) {
        const songs = await resolveSongsFromItems([firstItem]);
        if (songs.length > 0) albumName = songs[0].album;
    }

    if (albumName) {
        clearSelection();
        push({
            type: 'album_detail',
            data: {
                name: albumName,
                artist: item?.artist,
                songs: [],
                cover: item?.cover_path || null,
                count: 0,
            },
        });
        onNavigate?.();
    }
}

interface HandleShowArtistActionParams {
    isSingle: boolean;
    firstItem?: MusicItem;
    clearSelection: () => void;
    push: (value: any) => void;
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
    const item = firstItem as any;
    const type = getMusicItemType(firstItem);
    const artist = item?.artist || (type === 'artist' ? item?.name : undefined);
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
    const item = firstItem as any;
    if (getMusicItemType(firstItem) === 'file' && item.path) {
        try {
            const meta = await fileService.getMetadata(item.path);
            if (meta) songToCheck = meta;
        } catch { }
    }
    openProperties(songToCheck);
}
