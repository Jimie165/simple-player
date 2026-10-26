import { expect, it } from 'vitest';
import { isEligibleOnlineLyricsMatch, rankOnlineLyrics } from '@/features/library/dialogs/song-edit/rankOnlineLyrics';
import { orderedLyricsProviders } from '@/services/onlineLyricsService';
import type { OnlineLyricsCandidate } from '@/services/onlineLyricsService';

const item = (provider: string, title: string, artist = 'Adele'): OnlineLyricsCandidate => ({ provider, title, artist, id: title, album: '25', duration_ms: 300000 });
const track = { title: 'Hello', artist: 'Adele', album: '25', durationMs: 300000 };
const rank = (items: OnlineLyricsCandidate[], order = ['qq', 'netease', 'amll']) => rankOnlineLyrics(items, track, 'Hello Adele', 'Hello Adele', order);

it.each(['前島亜美 (まえしまあみ)', '前島亜美（まえしまあみ）', '前島亜美 (マエシマアミ)'])('prefers QQ for the Azurite screenshot when artist pronunciation is appended: %s', artist => {
    const metadata = { title: 'Azurite', artist: '前島亜美', album: 'Determination', durationMs: 246000 };
    const qq = { ...item('qq', 'Azurite', artist), id: '0007zpt72wswto', album: 'Determination', duration_ms: 246000 };
    const netease = { ...qq, provider: 'netease', id: '2644129780', artist: '前島亜美' };
    const lrclib = { ...netease, provider: 'lrclib', id: '17237964' };
    const query = 'Azurite 前島亜美 Determination';
    expect(isEligibleOnlineLyricsMatch(qq, metadata)).toBe(true);
    expect(rankOnlineLyrics([netease, lrclib, qq], metadata, query, query, ['amll', 'qq', 'kugou', 'netease', 'lrclib'])[0]).toBe(qq);
    expect(isEligibleOnlineLyricsMatch({ ...qq, title: 'Azurite - Single' }, metadata)).toBe(true);
    expect(isEligibleOnlineLyricsMatch({ ...netease, provider: 'qq' }, { ...metadata, artist })).toBe(true);
});
it('does not discard arbitrary artist parentheses or treat unrelated names as the same singer', () => {
    const metadata = { title: 'Azurite', artist: '前島亜美', album: 'Determination', durationMs: 246000 };
    for (const artist of ['前島亜美 (カバー)', '前島亜美 (トリビュート)', '前島亜美 (別人名)', '別の歌手 (まえしまあみ)']) {
        expect(isEligibleOnlineLyricsMatch({ ...item('qq', 'Azurite', artist), album: 'Determination', duration_ms: 246000 }, metadata)).toBe(false);
    }
});
it.each(['前島亜美', '前島亞美', '前岛亚美'])('matches QQ and Kugou spelling variants without changing provider preference: %s', artist => {
    const metadata = { title: 'Azurite', artist, album: 'Determination', durationMs: 246000 };
    const qq = { ...item('qq', 'Azurite', '前島亜美 (まえしまあみ)'), album: 'Determination', duration_ms: 246000 };
    const kugou = { ...qq, provider: 'kugou', artist: '前岛亚美' };
    const netease = { ...qq, provider: 'netease', artist: '前島亜美' };
    const query = `Azurite ${artist} Determination`;
    expect(isEligibleOnlineLyricsMatch(kugou, metadata)).toBe(true);
    expect(isEligibleOnlineLyricsMatch(qq, metadata)).toBe(true);
    expect(rankOnlineLyrics([netease, kugou, qq], metadata, query, query, ['qq', 'kugou', 'netease'])).toEqual([qq, kugou, netease]);
    expect(rankOnlineLyrics([netease, qq, kugou], metadata, query, query, ['kugou', 'qq', 'netease'])).toEqual([kugou, qq, netease]);
    expect(qq.artist).toBe('前島亜美 (まえしまあみ)');
    expect(kugou.artist).toBe('前岛亚美');
});
it('normalizes song titles and albums as well as artist names', () => {
    const metadata = { title: '聽見下雨的聲音', artist: '周杰倫', album: '哎呦，不錯哦', durationMs: 246000 };
    const kugou = { ...item('kugou', '听见下雨的声音', '周杰伦'), album: '哎呦，不错哦', duration_ms: 246000 };
    expect(isEligibleOnlineLyricsMatch(kugou, metadata)).toBe(true);
});
it('still rejects traditional-script live labels when the original is not live', () => {
    const metadata = { ...track, title: '聽見下雨的聲音', artist: '周杰倫' };
    const live = item('qq', '听见下雨的声音 (現場)', '周杰伦');
    expect(isEligibleOnlineLyricsMatch(live, metadata)).toBe(false);
    expect(isEligibleOnlineLyricsMatch(live, { ...metadata, title: '聽見下雨的聲音 (现场)' })).toBe(true);
});
it('normalizes simplified/traditional artist names in manually entered searches', () => {
    const qq = item('qq', '晴天', '周杰伦'), netease = item('netease', '晴天', '周杰倫');
    expect(rankOnlineLyrics([netease, qq], track, '晴天 周杰倫', 'Hello Adele 25', ['qq', 'netease'])).toEqual([qq, netease]);
});

it.each(['Hello - Single', 'Hello Single', 'Hello (Single)', 'Hello [Single]', 'Hello（Single）'])('prefers an eligible QQ result over a higher-scoring Netease result: %s', title => {
    const qq = item('qq', title), netease = item('netease', 'Hello');
    expect(rank([netease, qq])).toEqual([qq, netease]);
    expect(isEligibleOnlineLyricsMatch(qq, track)).toBe(true);
});
it('falls back to another source when the preferred result is low-match', () => {
    const qq = item('qq', 'Unrelated'), netease = item('netease', 'Hello');
    expect(rank([qq, netease])).toEqual([netease, qq]);
    expect(isEligibleOnlineLyricsMatch(qq, track)).toBe(false);
});
it('uses score within one source, but keeps eligible preferred sources first', () => {
    const qqSingle = item('qq', 'Hello - Single'), qqExact = item('qq', 'Hello'), netease = item('netease', 'Hello');
    expect(rank([qqSingle, netease, qqExact])).toEqual([qqExact, qqSingle, netease]);
});
it('puts all low matches at the end and sorts that group by score rather than source priority', () => {
    const lowQQ = item('qq', 'Unrelated'), lowNetease = item('netease', 'Hello Live'), good = item('amll', 'Hello');
    expect(rank([lowQQ, lowNetease, good])).toEqual([good, lowNetease, lowQQ]);
});
it.each(['Hello Live', 'Hello (Off Vocal)', 'Hello (Instrumental)', 'Hello (Remix)', 'Hello (Acoustic)'])('does not adopt a conflicting recording version: %s', title => {
    const qq = item('qq', title), netease = item('netease', 'Hello');
    expect(rank([qq, netease])[0]).toBe(netease);
    expect(isEligibleOnlineLyricsMatch(qq, track)).toBe(false);
});
it('preserves manual query relevance and permits explicitly searched live versions', () => {
    const live = item('qq', 'Hello Live');
    expect(rankOnlineLyrics([item('netease', 'Hello'), live], track, 'Hello Live', 'Hello Adele')[0]).toBe(live);
});
it('uses priority for eligible results in a manually entered song-and-artist query', () => {
    const qq = item('qq', 'Hello - Single'), netease = item('netease', 'Hello');
    expect(rankOnlineLyrics([netease, qq], track, 'Hello Adele', 'Hello Adele 25', ['qq', 'netease'])).toEqual([qq, netease]);
});
it('does not penalize missing AMLL duration or album', () => {
    const amll = { ...item('amll', 'Hello'), album: '', duration_ms: 0 };
    const qq = item('qq', 'Hello');
    expect(rank([qq, amll], ['amll', 'qq'])).toEqual([amll, qq]);
});
it('does not veto an otherwise eligible AMLL match solely for a different album edition', () => {
    const amll = { ...item('amll', 'Hello'), album: 'Other Edition', duration_ms: 0 };
    const qq = item('qq', 'Hello');
    expect(rank([qq, amll], ['amll', 'qq'])).toEqual([amll, qq]);
});
it('does not adopt an explicitly conflicting duration or different performer', () => {
    expect(isEligibleOnlineLyricsMatch({ ...item('qq', 'Hello'), duration_ms: 360000 }, track)).toBe(false);
    expect(isEligibleOnlineLyricsMatch(item('qq', 'Hello', 'Other Singer'), track)).toBe(false);
    expect(isEligibleOnlineLyricsMatch(item('qq', 'Hello', 'Adele Tribute'), track)).toBe(false);
});
it('does not declare every title/artist containment eligible when the combined score is below 80', () => {
    const weak = { ...item('qq', 'Hello - Single'), album: 'Other Album', duration_ms: 0 };
    expect(isEligibleOnlineLyricsMatch(weak, track)).toBe(false);
});
it('orders dropdown sources without duplicates and appends missing sources', () => {
    const providers = orderedLyricsProviders(['amll', 'qq', 'qq', 'unknown']).map(([id]) => id);
    expect(providers.slice(0, 2)).toEqual(['amll', 'qq']);
    expect(new Set(providers).size).toBe(providers.length);
    expect([...providers].sort()).toEqual(['amll', 'qq', 'netease', 'kugou', 'lrclib'].sort());
});
