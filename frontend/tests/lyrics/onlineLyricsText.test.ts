import { describe, expect, it } from 'vitest';
import { onlineLyricsText } from '@/features/library/dialogs/song-edit/onlineLyricsText';
import { parseLyrics } from '@/utils/lyrics/parseLyrics';
import { DOMParser } from '@xmldom/xmldom';

describe('online lyrics import', () => {
    it('decodes embedded KRC translations by line index without losing word timing', () => {
        const language = Buffer.from(JSON.stringify({ content: [
            { type: 0, lyricContent: [['he', 'llo']] },
            { type: 1, lyricContent: [['//'], [], ['世界 🌍'], ['你好']] },
        ] })).toString('base64');
        const text = onlineLyricsText({ format: 'krc',
            content: `[ti:Title]\n[language:${language}]\n[0,500]<0,500,0>Title\n[1000,500]<0,500,0>First\n[2000,1000]<0,400,0>World\n[3000,1000]<0,500,0>Hello`,
            translation: null, romanization: null });
        const document = parseLyrics({ rawText: text });
        expect(document.lines.find(line => line.text === 'World')?.translation).toBe('世界 🌍');
        expect(document.lines.find(line => line.text === 'Hello')?.translation).toBe('你好');
        expect(document.lines.find(line => line.text === 'First')?.translation).toBeNull();
        expect(document.lines.find(line => line.text === 'World')?.words[0].start_time_ms).toBe(2000);
        expect(document.lines.find(line => line.text === 'World')?.words[0].end_time_ms).toBe(2400);
        expect(document.timing_mode).toBe('word');
        expect(text).not.toContain('//');
    });
    it('keeps KRC lyrics usable with malformed or missing translation data', () => {
        const badJson = Buffer.from('{invalid').toString('base64');
        const wrongType = Buffer.from(JSON.stringify({ content: [{ type: 1, lyricContent: 'invalid' }] })).toString('base64');
        const pronunciation = Buffer.from(JSON.stringify({ content: [{ type: 0, lyricContent: [['pronunciation']] }] })).toString('base64');
        for (const language of ['', 'invalid-base64!', badJson, wrongType, pronunciation]) {
            const text = onlineLyricsText({ format: 'krc', content: `[language:${language}]\n[2000,1000]<0,400,0>World`, translation: null, romanization: null });
            const document = parseLyrics({ rawText: text });
            expect(document.lines[0].text).toBe('World');
            expect(document.lines[0].translation).toBeNull();
            expect(document.lines[0].words[0].end_time_ms).toBe(2400);
        }
    });
    it('aligns QQ centisecond translations with millisecond QRC without losing word times', () => {
        const text = onlineLyricsText({
            format: 'qrc',
            content: '[0,1000]Title(0,1000)\n[6591,3110]Hello(6591,2660)\n[10009,1000]World(10009,1000)',
            translation: '[00:00.00]//\n[00:06.59]你好\n[00:10.00]世界',
            romanization: null,
        });
        const document = parseLyrics({ rawText: text });
        expect(document.lines.find(line => line.text === 'Hello')?.translation).toBe('你好');
        expect(document.lines.find(line => line.text === 'World')?.translation).toBe('世界');
        expect(document.lines.find(line => line.text === 'Hello')?.words[0].start_time_ms).toBe(6591);
        expect(text).not.toContain('//');
    });
    it('prefers exact translations and never attaches translations outside the merge window', () => {
        const text = onlineLyricsText({
            format: 'qrc', content: '[1000,500]Hello(1000,500)\n[2000,500]World(2000,500)',
            translation: '[00:00.99]近似\n[00:01.00]精确\n[00:02.10]错位', romanization: null,
        });
        expect(text).toContain('[00:01.000] 精确');
        expect(text).not.toContain('近似');
        expect(text).not.toContain('错位');
    });
    it('preserves absolute YRC word times and explicit word ends', () => {
        const text = onlineLyricsText({ format: 'yrc', content: '[1000,3000](1000,500,0)你(2000,1500,0)好', translation: null, romanization: null });
        const line = parseLyrics({ rawText: text }).lines.find(line => line.text === '你好');
        expect(line?.words[1].start_time_ms).toBe(2000);
        expect(line?.words[1].end_time_ms).toBe(3500);
        expect(parseLyrics({ rawText: text }).timing_mode).toBe('word');
    });
    it('converts KRC relative times to absolute times', () => {
        const text = onlineLyricsText({ format: 'krc', content: '[5000,2000]<0,500,0>Hello <800,900,0>world', translation: null, romanization: null });
        expect(text).toContain('<00:05.800>world<00:06.700>');
        expect(parseLyrics({ rawText: text }).timing_mode).toBe('word');
    });
    it('retains original TTML verbatim', () => {
        const content = '<tt xmlns="http://www.w3.org/ns/ttml" />';
        expect(onlineLyricsText({ content, format: 'ttml', translation: null, romanization: null })).toBe(content);
    });
    it('retains TTML word mode and overlapping line intervals after import', () => {
        const content = '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><body><div><p begin="1" end="4"><span begin="1" end="4">Hello</span></p><p begin="3" end="5"><span begin="3" end="5">World</span></p></div></body></tt>';
        const text = onlineLyricsText({ content, format: 'ttml', translation: null, romanization: null });
        const document = parseLyrics({ rawText: text, domParser: { parseFromString: text => new DOMParser().parseFromString(text, 'application/xml') as unknown as Document } });
        expect(document.timing_mode).toBe('word');
        expect(document.lines[0].words[0].end_time_ms).toBe(4000);
        expect(document.lines[1].start_time_ms).toBe(3000);
    });
    it('converts QRC trailing timing markers and preserves parentheses in YRC text', () => {
        const payload = { translation: null, romanization: null };
        const qrc = parseLyrics({ rawText: onlineLyricsText({ ...payload, format: 'qrc', content: '[1000,2000]你(1000,500)好(2000,800)' }) });
        expect(qrc.timing_mode).toBe('word');
        expect(qrc.lines[0].words[1].end_time_ms).toBe(2800);
        const yrc = parseLyrics({ rawText: onlineLyricsText({ ...payload, format: 'yrc', content: '[1000,2000](1000,1000,0)(Hello)(2000,500,0) world' }) });
        expect(yrc.lines[0].text).toBe('(Hello) world');
    });
});
