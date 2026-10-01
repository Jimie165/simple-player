import { describe, expect, it } from 'vitest';
import { mediaPathKey } from '@/utils/mediaPath';

describe('media path identity', () => {
    it('keeps separate library entries for case-sensitive macOS paths', () => {
        const library = new Map([
            [mediaPathKey('/Volumes/Music/Track.flac'), 1],
            [mediaPathKey('/Volumes/Music/track.flac'), 2],
        ]);
        expect(library.size).toBe(2);
        expect(library.get(mediaPathKey('/Volumes/Music/Track.flac'))).toBe(1);
        expect(library.get(mediaPathKey('/Volumes/Music/track.flac'))).toBe(2);
    });

    it('matches Windows database paths to native drive and UNC paths', () => {
        const library = new Map([
            [mediaPathKey('D:/Music/Track.flac'), 1],
            [mediaPathKey('//Server/Music/Track.flac'), 2],
        ]);
        expect(library.get(mediaPathKey('d:\\music\\track.flac'))).toBe(1);
        expect(library.get(mediaPathKey('\\\\server\\music\\track.flac'))).toBe(2);
    });
});
