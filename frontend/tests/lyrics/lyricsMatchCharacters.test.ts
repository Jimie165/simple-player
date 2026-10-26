import { expect, it } from 'vitest';
import { foldLyricsMatchText } from '@/features/library/dialogs/song-edit/lyricsMatchCharacters';

it.each([
    ['前島亜美', '前岛亚美'], ['前島亞美', '前岛亚美'], ['前岛亚美', '前岛亚美'],
    ['周杰倫', '周杰伦'], ['廣瀨香美', '广濑香美'], ['広瀬香美', '广濑香美'],
    ['櫻花', '樱花'], ['桜花', '樱花'], ['現場', '现场'],
])('folds script variants for matching: %s', (source, expected) => {
    expect(foldLyricsMatchText(source)).toBe(expected);
});
it('preserves emoji, kana and unrelated characters', () => {
    expect(foldLyricsMatchText('Azurite まえしまあみ 🎵 𠮷')).toBe('Azurite まえしまあみ 🎵 𠮷');
});
