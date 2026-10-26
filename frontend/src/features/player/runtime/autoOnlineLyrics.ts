import type { SongMetadata } from '@/types';
import { onlineLyricsService, orderedLyricsProviders } from '@/services/onlineLyricsService';
import { onlineLyricsText } from '@/features/library/dialogs/song-edit/onlineLyricsText';
import { isEligibleOnlineLyricsMatch, rankOnlineLyrics } from '@/features/library/dialogs/song-edit/rankOnlineLyrics';
import { parseLyrics } from '@/utils/lyrics/parseLyrics';

/** Only high-confidence candidates are safe to persist without user confirmation. */
export async function fetchAutomaticLyrics(song: SongMetadata, order: readonly string[], isCurrent: () => boolean): Promise<string | null> {
    if (!song.title.trim() || !song.artist.trim() || !isCurrent()) return null;
    const keyword = [song.title, song.artist, song.album].map(value => value.trim()).filter(Boolean).join(' ');
    const track = { title: song.title, artist: song.artist, album: song.album, durationMs: song.duration * 1000 };
    // Prefetch concurrently, but consume in preference order, not completion order.
    const searches = orderedLyricsProviders(order).map(async ([source]) => {
        try {
            const query = source === 'amll' ? [song.title, song.artist].join(' ') : keyword;
            const result = await onlineLyricsService.search(query, source);
            if (!isCurrent()) return [];
            if (!result.candidates.some(item => isEligibleOnlineLyricsMatch(item, track)) && query !== song.title.trim()) {
                const fallback = await onlineLyricsService.search(song.title.trim(), source);
                const combined = new Map(result.candidates.map(item => [`${item.provider}:${item.id}`, item]));
                for (const item of fallback.candidates) combined.set(`${item.provider}:${item.id}`, item);
                result.candidates = [...combined.values()];
            }
            return result.candidates;
        } catch {
            return [];
        }
    });
    for (const search of searches) {
        const items = await search;
        if (!isCurrent()) return null;
        const candidates = rankOnlineLyrics(items, track, keyword, keyword, order)
            .filter(item => isEligibleOnlineLyricsMatch(item, track));
        for (const candidate of candidates) {
            if (!isCurrent()) return null;
            try {
                const text = onlineLyricsText(await onlineLyricsService.fetch(candidate));
                if (!isCurrent()) return null;
                if (parseLyrics({ rawText: text }).lines.some(line => line.text.trim())) return text;
            } catch {
                // Exhaust usable candidates from this source before falling back.
            }
        }
    }
    return null;
}
