import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { parseLyrics } from '@/utils/lyrics/parseLyrics';

function parse(body: string) {
    return parseLyrics({
        rawText: `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body>${body}</body></tt>`,
        domParser: {
            parseFromString: (text) => new DOMParser().parseFromString(text, 'application/xml') as unknown as Document,
        },
    }).lines;
}

describe('TTML translations', () => {
    it('keeps background translation and romanization separate from sung words', () => {
        const [main, background] = parse(`<p begin="73.691" end="77.512">
            <span begin="73.691" end="77.144">確かめよう</span>
            <span ttm:role="x-translation" xml:lang="zh-CN">去确认吧</span>
            <span ttm:role="x-bg" begin="75.930" end="77.512">
                <span begin="75.930" end="76.529">(希</span><span begin="76.529" end="77.205">望</span><span begin="77.205" end="77.512">を)</span>
                <span ttm:role="x-translation" xml:lang="zh-CN">这份希望</span>
                <span ttm:role="x-roman">ki bo u wo</span>
            </span>
        </p>`);
        expect(main.translation).toBe('去确认吧');
        expect(background).toMatchObject({
            parent_id: main.id, role: 'background', text: '希望を',
            translation: '这份希望', romanization: 'ki bo u wo',
            start_time_ms: 75930, end_time_ms: 77512,
        });
        expect(background.words.map(word => word.text)).toEqual(['希', '望', 'を']);
    });

    it.each(['zh-Hans', 'zh-CN', 'zh-Hans-CN', 'ZH-cn', 'zh-SG'])(
        'prefers %s over translations before and after it for both voices', (language) => {
            const translations = `<span ttm:role="x-translation" xml:lang="en">English</span>
                <span ttm:role="x-translation" xml:lang="${language}">简体中文</span>
                <span ttm:role="x-translation" xml:lang="zh-Hant">繁體中文</span>
                <span ttm:role="x-translation" xml:lang="it">Italiano</span>`;
            const lines = parse(`<p begin="1" end="2">主唱${translations}
                <span ttm:role="x-bg" begin="1" end="2">(和声)${translations}</span></p>`);
            expect(lines.map(line => line.translation)).toEqual(['简体中文', '简体中文']);
            expect(lines[1]).toMatchObject({ text: '和声', words: [], start_time_ms: 1000, end_time_ms: 2000 });
        },
    );

    it('falls back to the first nonempty translation when simplified Chinese is absent', () => {
        const [line] = parse(`<p begin="1" end="2">歌詞
            <span ttm:role="x-translation" xml:lang="zh-Hans"> </span>
            <span ttm:role="x-translation" xml:lang="en">English</span>
            <span ttm:role="x-translation" xml:lang="fr">Français</span>
        </p>`);
        expect(line.translation).toBe('English');
    });
});
