import type { OnlineLyricsCandidate } from '@/services/onlineLyricsService';
import { foldLyricsMatchText } from '@/features/library/dialogs/song-edit/lyricsMatchCharacters';

const normalize = (text: string) => foldLyricsMatchText(text).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function similarity(a: string, b: string): number {
    const x = normalize(a), y = normalize(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.includes(y) || y.includes(x)) return 0.65;
    const grams = (s: string) => new Set(Array.from(s).slice(1).map((c, i) => Array.from(s)[i] + c));
    const left = grams(x), right = grams(y);
    const common = [...left].filter(g => right.has(g)).length;
    return common / Math.max(1, left.size + right.size - common) * 0.5;
}

interface MatchTrack { title: string; artist: string; album: string; durationMs: number }

const MINIMUM_MATCH_SCORE = 0.8;
const MAXIMUM_DURATION_DIFFERENCE_MS = 10000;

function versionKey(text: string): string {
    const value = foldLyricsMatchText(text).toLocaleLowerCase();
    return [
        /\blive\b|现场|演唱会/, /\binstrumental\b|\boff[\s-]*vocal\b|\bkaraoke\b|伴奏/,
        /\bremix\b|重混/, /\bacoustic\b|不插电/, /\bradio[\s-]*edit\b/, /\bsped[\s-]*up\b|\bslowed\b/,
    ].map((pattern, index) => pattern.test(value) ? String(index) : '').filter(Boolean).join(',');
}

function artistIdentities(text: string): string[] {
    return text.normalize('NFKC').split(/, | \/ |、|; /).map(name => {
        // QQ appends kana pronunciations, e.g. 前島亜美 (まえしまあみ).
        // Ignore only that annotation, not arbitrary artist names or cover credits.
        const reading = /\s*\(([\p{Script=Hiragana}\p{Script=Katakana}\s・ー]+)\)\s*$/u.exec(name);
        if (reading && !/カバー|トリビュート|ライブ|カラオケ/u.test(reading[1])) {
            const base = name.slice(0, reading.index).trim();
            if (base) return normalize(base);
        }
        return normalize(name);
    }).filter(Boolean);
}

function evaluateMatch(item: OnlineLyricsCandidate, track: MatchTrack) {
    const title = similarity(track.title, item.title);
    const trackArtists = artistIdentities(track.artist);
    const candidateArtists = artistIdentities(item.artist);
    const artist = similarity(trackArtists.join(' / '), candidateArtists.join(' / '));
    let total = title * 40 + artist * 30;
    let weight = 70;
    if (track.album.trim() && item.album.trim()) { total += similarity(track.album, item.album) * 10; weight += 10; }
    const knownDuration = track.durationMs > 0 && item.duration_ms > 0;
    const delta = Math.abs(track.durationMs - item.duration_ms);
    if (knownDuration) {
        total += delta <= 3000 ? 30 : delta <= 10000 ? 15 : delta <= 30000 ? 5 : 0;
        weight += 30;
    }
    // Unknown AMLL duration/album is not a mismatch. Score alone must not allow
    // a different performer or recording version to enter the automatic tier.
    const score = total / weight;
    const primaryArtist = trackArtists[0];
    const sameArtist = Boolean(primaryArtist && candidateArtists.includes(primaryArtist));
    const eligible = score >= MINIMUM_MATCH_SCORE && title >= 0.6 && sameArtist
        && versionKey(track.title) === versionKey(item.title)
        && (!knownDuration || delta <= MAXIMUM_DURATION_DIFFERENCE_MS);
    return { score, eligible };
}

export function isEligibleOnlineLyricsMatch(item: OnlineLyricsCandidate, track: MatchTrack): boolean {
    return evaluateMatch(item, track).eligible;
}

export function rankOnlineLyrics(items: OnlineLyricsCandidate[], track: MatchTrack, query: string, originalQuery: string, providerOrder: readonly string[] = []): OnlineLyricsCandidate[] {
    const originalSearch = [originalQuery, `${track.title} ${track.artist}`, track.title]
        .some(value => normalize(query) === normalize(value));
    const evaluate = (item: OnlineLyricsCandidate) => {
        // A manually changed query takes precedence over the current track's metadata.
        if (!originalSearch) {
            const terms = query.normalize('NFKC').split(/\s+/).filter(Boolean);
            const haystack = `${item.title} ${item.artist} ${item.album}`;
            const score = (terms.reduce((total, term) => total + (normalize(haystack).includes(normalize(term)) ? 1 : 0), 0) / Math.max(1, terms.length)
                + Math.max(similarity(query, item.title), similarity(query, `${item.title} ${item.artist}`))) / 2;
            return { score, eligible: score >= MINIMUM_MATCH_SCORE && versionKey(query) === versionKey(item.title) };
        }
        return evaluateMatch(item, track);
    };
    const priority = (provider: string) => providerOrder.includes(provider) ? providerOrder.indexOf(provider) : providerOrder.length;
    return items.map(item => ({ item, ...evaluate(item) })).sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        const sourceOrder = priority(a.item.provider) - priority(b.item.provider);
        return a.eligible ? sourceOrder || b.score - a.score : b.score - a.score || sourceOrder;
    }).map(({ item }) => item);
}
