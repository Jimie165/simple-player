import type { SongMetadata } from '@/types';
import type { UpdateSongDetailsRequest } from '@/services/libraryService';

export interface SongEditFormValues {
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    year: string;
    genre: string;
    trackNumber: string;
    trackTotal: string;
    discNumber: string;
    discTotal: string;
    lyricsText: string;
    lyricsSourcePath: string;
    customLyricsEnabled: boolean;
}

export interface SongEditFormErrors {
    title?: string;
    year?: string;
    trackNumber?: string;
    trackTotal?: string;
    discNumber?: string;
    discTotal?: string;
}

export const makeInitialSongEditForm = (song: SongMetadata): SongEditFormValues => ({
    title: song.title || '',
    artist: song.artist || '',
    album: song.album || '',
    albumArtist: song.album_artist || '',
    year: song.year?.toString() || '',
    genre: song.genre || '',
    trackNumber: song.track_number?.toString() || '',
    trackTotal: song.track_total?.toString() || '',
    discNumber: song.disc_number?.toString() || '',
    discTotal: song.disc_total?.toString() || '',
    lyricsText: song.lyrics_text || '',
    lyricsSourcePath: song.lyrics_source_path || '',
    customLyricsEnabled: Boolean(song.lyrics_text?.trim()),
});

const optionalText = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const optionalNumber = (
    value: string,
    field: keyof SongEditFormErrors,
    label: string,
    errors: SongEditFormErrors
) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const number = Number(trimmed);
    if (!Number.isInteger(number) || number < 0) {
        errors[field] = `${label}需要是非负整数`;
        return null;
    }
    return number;
};

export function buildUpdateSongDetailsRequest(
    song: SongMetadata,
    values: SongEditFormValues
): { request: UpdateSongDetailsRequest | null; errors: SongEditFormErrors } {
    const errors: SongEditFormErrors = {};
    const title = values.title.trim();

    if (!title) {
        errors.title = '标题不能为空';
    }

    const year = optionalNumber(values.year, 'year', '年份', errors);
    const trackNumber = optionalNumber(values.trackNumber, 'trackNumber', '曲号', errors);
    const trackTotal = optionalNumber(values.trackTotal, 'trackTotal', '总曲数', errors);
    const discNumber = optionalNumber(values.discNumber, 'discNumber', '碟号', errors);
    const discTotal = optionalNumber(values.discTotal, 'discTotal', '总碟数', errors);

    if (Object.keys(errors).length > 0 || typeof song.id !== 'number') {
        return { request: null, errors };
    }

    const lyricsText = values.customLyricsEnabled ? optionalText(values.lyricsText) : null;

    return {
        request: {
            id: song.id,
            title,
            artist: values.artist.trim(),
            album: values.album.trim(),
            album_artist: optionalText(values.albumArtist),
            year,
            genre: optionalText(values.genre),
            track_number: trackNumber,
            track_total: trackTotal,
            disc_number: discNumber,
            disc_total: discTotal,
            lyrics_text: lyricsText,
            lyrics_source_path: lyricsText ? optionalText(values.lyricsSourcePath) : null,
        },
        errors,
    };
}
