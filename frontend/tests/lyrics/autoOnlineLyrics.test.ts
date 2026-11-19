import { afterEach, expect, it, vi } from 'vitest';
import { fetchAutomaticLyrics } from '@/features/player/runtime/autoOnlineLyrics';
import { onlineLyricsService } from '@/services/onlineLyricsService';
import type { OnlineLyricsCandidate } from '@/services/onlineLyricsService';

const song = { id: 1, path: 'D:/song.flac', title: 'Hello', artist: 'Adele', album: '25', duration: 300 };
const candidate = (provider: string): OnlineLyricsCandidate => ({ provider, id: provider, title: 'Hello', artist: 'Adele', album: '25', duration_ms: 300000 });
const payload = (content: string) => ({ content, format: 'lrc', translation: null, romanization: null });
afterEach(() => vi.restoreAllMocks());

it('automatically selects the QQ Azurite candidate with an appended Japanese artist pronunciation', async () => {
    const metadata = { ...song, title: 'Azurite', artist: '前島亜美', album: 'Determination', duration: 246 };
    const base = { ...candidate('netease'), title: 'Azurite', artist: '前島亜美', album: 'Determination', duration_ms: 246000 };
    const qq = { ...base, provider: 'qq', id: '0007zpt72wswto', artist: '前島亜美 (まえしまあみ)' };
    vi.spyOn(onlineLyricsService, 'search').mockImplementation((_query, source) => Promise.resolve({ candidates: source === 'amll' ? [] : source === 'qq' ? [qq] : [{ ...base, provider: source }], errors: [] }));
    const fetch = vi.spyOn(onlineLyricsService, 'fetch').mockResolvedValue(payload('[00:01]Azurite'));
    expect(await fetchAutomaticLyrics(metadata, ['amll', 'qq', 'kugou', 'netease', 'lrclib'], () => true)).toBe('[00:01]Azurite');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(qq);
});
it('automatically selects Kugou first when its simplified artist spelling matches a Japanese name', async () => {
    const metadata = { ...song, title: 'Azurite', artist: '前島亜美', album: 'Determination', duration: 246 };
    const base = { ...candidate('netease'), title: 'Azurite', artist: '前島亜美', album: 'Determination', duration_ms: 246000 };
    const kugou = { ...base, provider: 'kugou', artist: '前岛亚美' };
    vi.spyOn(onlineLyricsService, 'search').mockImplementation((_query, source) => Promise.resolve({ candidates: source === 'kugou' ? [kugou] : [{ ...base, provider: source }], errors: [] }));
    const fetch = vi.spyOn(onlineLyricsService, 'fetch').mockResolvedValue(payload('[00:01]Azurite'));
    expect(await fetchAutomaticLyrics(metadata, ['kugou', 'qq', 'netease'], () => true)).toBe('[00:01]Azurite');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(kugou);
});

it('automatically prefers eligible QQ over an exact-match result from a lower-priority source', async () => {
    const qq = { ...candidate('qq'), title: 'Hello - Single' };
    vi.spyOn(onlineLyricsService, 'search').mockImplementation((_query, source) => Promise.resolve({ candidates: source === 'qq' ? [qq] : [candidate(source)], errors: [] }));
    const fetch = vi.spyOn(onlineLyricsService, 'fetch').mockResolvedValue(payload('[00:01]Hello'));
    expect(await fetchAutomaticLyrics(song, ['qq', 'netease'], () => true)).toBe('[00:01]Hello');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(qq);
});

it('falls back when the preferred source only has low-match candidates', async () => {
    const netease = candidate('netease');
    vi.spyOn(onlineLyricsService, 'search').mockImplementation((_query, source) => Promise.resolve({ candidates: source === 'netease' ? [netease] : [{ ...candidate(source), title: 'Unrelated' }], errors: [] }));
    const fetch = vi.spyOn(onlineLyricsService, 'fetch').mockResolvedValue(payload('[00:01]Hello'));
    expect(await fetchAutomaticLyrics(song, ['qq', 'netease'], () => true)).toBe('[00:01]Hello');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(netease);
});

it('tries the next usable candidate from the preferred source before switching platforms', async () => {
    const first = { ...candidate('qq'), id: 'first' }, second = { ...candidate('qq'), id: 'second', title: 'Hello - Single' };
    vi.spyOn(onlineLyricsService, 'search').mockImplementation((_query, source) => Promise.resolve({ candidates: source === 'qq' ? [second, first] : [candidate(source)], errors: [] }));
    const fetch = vi.spyOn(onlineLyricsService, 'fetch').mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(payload('[00:01]Hello'));
    expect(await fetchAutomaticLyrics(song, ['qq', 'netease'], () => true)).toBe('[00:01]Hello');
    expect(fetch.mock.calls.map(([item]) => item.id)).toEqual(['first', 'second']);
});

it('does not wait for lower-priority searches once the preferred source succeeds', async () => {
    type Result = Awaited<ReturnType<typeof onlineLyricsService.search>>;
    let finish: (value: Result) => void = () => undefined;
    const slow = new Promise<Result>(resolve => { finish = resolve; });
    vi.spyOn(onlineLyricsService, 'search').mockImplementation(async (_query, source) => source === 'qq' ? { candidates: [candidate('qq')], errors: [] } : slow);
    const fetch = vi.spyOn(onlineLyricsService, 'fetch').mockResolvedValue(payload('[00:01]Hello'));
    try {
        expect(await fetchAutomaticLyrics(song, ['qq', 'netease'], () => true)).toBe('[00:01]Hello');
        expect(fetch.mock.calls[0][0].provider).toBe('qq');
    } finally { finish({ candidates: [], errors: [] }); }
});

it('waits for the preferred source instead of choosing whichever search finishes first', async () => {
    type Result = Awaited<ReturnType<typeof onlineLyricsService.search>>;
    let finish: (value: Result) => void = () => undefined;
    const preferred = new Promise<Result>(resolve => { finish = resolve; });
    const qq = { ...candidate('qq'), title: 'Hello - Single' };
    vi.spyOn(onlineLyricsService, 'search').mockImplementation(async (_query, source) => source === 'qq' ? preferred : { candidates: [candidate(source)], errors: [] });
    const fetch = vi.spyOn(onlineLyricsService, 'fetch').mockResolvedValue(payload('[00:01]Hello'));
    const result = fetchAutomaticLyrics(song, ['qq', 'netease'], () => true);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    finish({ candidates: [qq], errors: [] });
    expect(await result).toBe('[00:01]Hello');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(qq);
});

it('downloads the highest-priority exact match, including AMLL with no duration', async () => {
    const amll = { ...candidate('amll'), album: '', duration_ms: 0 };
    vi.spyOn(onlineLyricsService, 'search').mockImplementation((_query, source) => Promise.resolve({ candidates: source === 'amll' ? [amll] : [candidate(source)], errors: [] }));
    const fetch = vi.spyOn(onlineLyricsService, 'fetch').mockResolvedValue(payload('[00:01]Hello'));
    expect(await fetchAutomaticLyrics(song, ['amll', 'qq'], () => true)).toBe('[00:01]Hello');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(amll);
});
it('tries the next match when the preferred platform download fails', async () => {
    vi.spyOn(onlineLyricsService, 'search').mockImplementation((_query, source) => Promise.resolve({ candidates: [candidate(source)], errors: [] }));
    const fetch = vi.spyOn(onlineLyricsService, 'fetch').mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(payload('[00:01]Hello'));
    expect(await fetchAutomaticLyrics(song, ['qq', 'netease'], () => true)).toBe('[00:01]Hello');
    expect(fetch.mock.calls.map(([item]) => item.provider)).toEqual(['qq', 'netease']);
});
it('does not download low-confidence or wrong-duration results', async () => {
    vi.spyOn(onlineLyricsService, 'search').mockResolvedValue({ candidates: [{ ...candidate('qq'), duration_ms: 360000 }, { ...candidate('amll'), title: 'Hello Live' }], errors: [] });
    const fetch = vi.spyOn(onlineLyricsService, 'fetch');
    expect(await fetchAutomaticLyrics(song, ['amll'], () => true)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
});
it('discards results after a track switch during search', async () => {
    let current = true;
    vi.spyOn(onlineLyricsService, 'search').mockImplementation(() => { current = false; return Promise.resolve({ candidates: [candidate('qq')], errors: [] }); });
    const fetch = vi.spyOn(onlineLyricsService, 'fetch');
    expect(await fetchAutomaticLyrics(song, [], () => current)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
});
it('discards lyrics downloaded after the request becomes stale', async () => {
    let current = true;
    vi.spyOn(onlineLyricsService, 'search').mockResolvedValue({ candidates: [candidate('qq')], errors: [] });
    vi.spyOn(onlineLyricsService, 'fetch').mockImplementation(() => { current = false; return Promise.resolve(payload('[00:01]Hello')); });
    expect(await fetchAutomaticLyrics(song, [], () => current)).toBeNull();
});
it('retries title-only searches but never auto-imports without artist metadata', async () => {
    const search = vi.spyOn(onlineLyricsService, 'search').mockImplementation((query, source) => Promise.resolve({ candidates: query === 'Hello' ? [candidate(source)] : [], errors: [] }));
    vi.spyOn(onlineLyricsService, 'fetch').mockResolvedValue(payload('[00:01]Hello'));
    expect(await fetchAutomaticLyrics(song, [], () => true)).toBe('[00:01]Hello');
    expect(search).toHaveBeenCalledWith('Hello', 'qq');
    search.mockClear();
    expect(await fetchAutomaticLyrics({ ...song, artist: '' }, [], () => true)).toBeNull();
    expect(search).not.toHaveBeenCalled();
});
