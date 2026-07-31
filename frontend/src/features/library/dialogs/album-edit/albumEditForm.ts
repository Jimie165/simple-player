import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type {
    AlbumFieldUpdate,
    UpdateAlbumDetailsRequest,
    UpdateAlbumSongDetails,
} from '@/services/libraryService';
import type { SongMetadata } from '@/types';

export type AlbumEditFieldKey =
    | 'album'
    | 'artist'
    | 'albumArtist'
    | 'genre'
    | 'year'
    | 'trackNumber'
    | 'trackTotal'
    | 'discNumber'
    | 'discTotal';

export interface AlbumEditFieldState {
    value: string;
    mixed: boolean;
    dirty: boolean;
    restoreOriginal: boolean;
}

export type AlbumEditFields = Record<AlbumEditFieldKey, AlbumEditFieldState>;

export interface AlbumEditFormValues {
    fields: AlbumEditFields;
    artworkSourcePath: string | null;
    removeArtwork: boolean;
}

export type AlbumEditFormErrors = Partial<Record<AlbumEditFieldKey, string>>;
export type AlbumOriginalMetadata = Record<number, SongMetadata>;

const makeField = (values: string[]): AlbumEditFieldState => {
    const first = values[0] ?? '';
    const mixed = values.some(value => value !== first);
    return {
        value: mixed ? '' : first,
        mixed,
        dirty: false,
        restoreOriginal: false,
    };
};

const numberValue = (value: number | null | undefined) => value?.toString() ?? '';
const numericFields = new Set<AlbumEditFieldKey>([
    'year',
    'trackNumber',
    'trackTotal',
    'discNumber',
    'discTotal',
]);

const normalizeFieldValue = (field: AlbumEditFieldKey, value: string) => {
    const trimmed = value.trim();
    return numericFields.has(field) && trimmed ? String(Number(trimmed)) : trimmed;
};

const getSongFieldValue = (song: SongMetadata, field: AlbumEditFieldKey) => {
    switch (field) {
        case 'album': return song.album ?? '';
        case 'artist': return song.artist ?? '';
        case 'albumArtist': return song.album_artist ?? '';
        case 'genre': return song.genre ?? '';
        case 'year': return numberValue(song.year);
        case 'trackNumber': return numberValue(song.track_number);
        case 'trackTotal': return numberValue(song.track_total);
        case 'discNumber': return numberValue(song.disc_number);
        case 'discTotal': return numberValue(song.disc_total);
    }
};

export function makeInitialAlbumEditForm(album: AlbumData): AlbumEditFormValues {
    const songs = album.songs;
    return {
        fields: {
            album: makeField(songs.map(song => song.album ?? '')),
            artist: makeField(songs.map(song => song.artist ?? '')),
            // 只读取实际 album_artist 元数据，不回退到歌曲艺人。
            albumArtist: makeField(songs.map(song => song.album_artist ?? '')),
            genre: makeField(songs.map(song => song.genre ?? '')),
            year: makeField(songs.map(song => numberValue(song.year))),
            trackNumber: makeField(songs.map(song => numberValue(song.track_number))),
            trackTotal: makeField(songs.map(song => numberValue(song.track_total))),
            discNumber: makeField(songs.map(song => numberValue(song.disc_number))),
            discTotal: makeField(songs.map(song => numberValue(song.disc_total))),
        },
        artworkSourcePath: null,
        removeArtwork: false,
    };
}

export function makeOriginalAlbumField(
    album: AlbumData,
    originals: AlbumOriginalMetadata,
    field: AlbumEditFieldKey
): AlbumEditFieldState {
    const values = album.songs.flatMap(song => (
        typeof song.id === 'number' && originals[song.id]
            ? [getSongFieldValue(originals[song.id], field)]
            : []
    ));
    return {
        ...makeField(values),
        dirty: true,
        restoreOriginal: true,
    };
}

export function canRestoreAlbumField(
    album: AlbumData,
    originals: AlbumOriginalMetadata | null,
    fields: AlbumEditFields,
    field: AlbumEditFieldKey
) {
    if (!originals || fields[field].restoreOriginal) return false;
    return album.songs.some(song => (
        typeof song.id === 'number'
        && originals[song.id]
        && normalizeFieldValue(
            field,
            fields[field].dirty ? fields[field].value : getSongFieldValue(song, field)
        ) !== normalizeFieldValue(field, getSongFieldValue(originals[song.id], field))
    ));
}

export function getAlbumEditCoverPath(
    album: AlbumData,
    artworkSourcePath: string | null,
    removeArtwork: boolean
) {
    if (artworkSourcePath) return artworkSourcePath;
    if (removeArtwork) {
        return album.songs.find(song => song.embedded_cover_path)?.embedded_cover_path ?? null;
    }
    return album.cover_path ?? album.cover ?? null;
}

function validateOptionalNumber(
    field: AlbumEditFieldState,
    key: AlbumEditFieldKey,
    label: string,
    errors: AlbumEditFormErrors
) {
    const value = field.value.trim();
    if (!value) return;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) {
        errors[key] = `${label}需要是非负整数`;
    }
}

const textUpdate = (value: string, optional: boolean): AlbumFieldUpdate<string> => ({
    value: optional ? value.trim() || null : value.trim(),
});

const numberUpdate = (value: string): AlbumFieldUpdate<number> => ({
    value: value.trim() ? Number(value) : null,
});

function hasMetadataOverrides(
    song: SongMetadata,
    original: SongMetadata | undefined,
    fields: AlbumEditFields
) {
    if (!original) return true;
    if ((song.title ?? '').trim() !== (original.title ?? '').trim()) return true;

    return (Object.keys(fields) as AlbumEditFieldKey[]).some(field => {
        const state = fields[field];
        const finalValue = !state.dirty
            ? getSongFieldValue(song, field)
            : state.restoreOriginal
                ? getSongFieldValue(original, field)
                : state.value;
        return normalizeFieldValue(field, finalValue)
            !== normalizeFieldValue(field, getSongFieldValue(original, field));
    });
}

function makeSongUpdate(
    song: SongMetadata,
    fields: AlbumEditFields,
    original?: SongMetadata
): UpdateAlbumSongDetails | null {
    if (typeof song.id !== 'number') return null;
    const update: UpdateAlbumSongDetails = {
        id: song.id,
        metadata_overridden: hasMetadataOverrides(song, original, fields),
    };
    let changed = false;
    const resolve = (field: AlbumEditFieldKey) => {
        const state = fields[field];
        if (!state.dirty) return undefined;
        changed = true;
        return state.restoreOriginal && original
            ? getSongFieldValue(original, field)
            : state.value;
    };

    const album = resolve('album');
    const artist = resolve('artist');
    const albumArtist = resolve('albumArtist');
    const genre = resolve('genre');
    const year = resolve('year');
    const trackNumber = resolve('trackNumber');
    const trackTotal = resolve('trackTotal');
    const discNumber = resolve('discNumber');
    const discTotal = resolve('discTotal');

    if (album !== undefined) update.album = textUpdate(album, false);
    if (artist !== undefined) update.artist = textUpdate(artist, false);
    if (albumArtist !== undefined) update.album_artist = textUpdate(albumArtist, true);
    if (genre !== undefined) update.genre = textUpdate(genre, true);
    if (year !== undefined) update.year = numberUpdate(year);
    if (trackNumber !== undefined) update.track_number = numberUpdate(trackNumber);
    if (trackTotal !== undefined) update.track_total = numberUpdate(trackTotal);
    if (discNumber !== undefined) update.disc_number = numberUpdate(discNumber);
    if (discTotal !== undefined) update.disc_total = numberUpdate(discTotal);

    return changed ? update : null;
}

export function buildUpdateAlbumDetailsRequest(
    album: AlbumData,
    values: AlbumEditFormValues,
    originals: AlbumOriginalMetadata | null
): { request: UpdateAlbumDetailsRequest | null; errors: AlbumEditFormErrors } {
    const errors: AlbumEditFormErrors = {};
    const ids = album.songs
        .map(song => song.id)
        .filter((id): id is number => typeof id === 'number');
    const fields = values.fields;
    const numericFields: Array<[AlbumEditFieldKey, string]> = [
        ['year', '年份'],
        ['trackNumber', '曲号'],
        ['trackTotal', '总曲数'],
        ['discNumber', '碟号'],
        ['discTotal', '总碟数'],
    ];
    numericFields.forEach(([key, label]) => {
        const field = fields[key];
        if (field.dirty && !field.restoreOriginal) {
            validateOptionalNumber(field, key, label, errors);
        }
    });

    if (ids.length === 0 || Object.keys(errors).length > 0) {
        return { request: null, errors };
    }

    return {
        request: {
            ids,
            updates: album.songs.flatMap(song => {
                const original = typeof song.id === 'number' ? originals?.[song.id] : undefined;
                const update = makeSongUpdate(song, fields, original);
                return update ? [update] : [];
            }),
            artwork_source_path: values.artworkSourcePath,
            remove_artwork: values.removeArtwork,
        },
        errors,
    };
}
