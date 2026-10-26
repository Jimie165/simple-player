import type { OnlineLyricsPayload } from '@/services/onlineLyricsService';

const stamp = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;

function krcTranslations(content: string): string[] {
    const encoded = /^\[language:([^\]]+)\]/m.exec(content)?.[1];
    if (!encoded) return [];
    try {
        const json: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.trim()), char => char.charCodeAt(0))));
        if (!json || typeof json !== 'object' || !('content' in json) || !Array.isArray(json.content)) return [];
        // KRC type 0 contains pronunciation, type 1 contains line translations.
        const entry: unknown = json.content.find((entry: unknown) => entry !== null && typeof entry === 'object' && 'type' in entry && entry.type === 1);
        if (!entry || typeof entry !== 'object' || !('lyricContent' in entry) || !Array.isArray(entry.lyricContent)) return [];
        // Keep empty/invalid rows so later translations retain their original line indices.
        return entry.lyricContent.map((row: unknown) => Array.isArray(row) && typeof row[0] === 'string' ? row[0] : '');
    } catch {
        return [];
    }
}

// Convert platform word times to the enhanced LRC syntax supported by our editor.
// Explicit closing stamps retain word endings, including silence between words.
export function onlineLyricsText(payload: OnlineLyricsPayload): string {
    if (payload.format === 'ttml') return payload.content;
    let content = payload.content;
    if (payload.format === 'yrc' || payload.format === 'krc' || payload.format === 'qrc') {
        const translations = payload.format === 'krc' && !payload.translation ? krcTranslations(content) : [];
        let lyricIndex = 0;
        content = content.split(/\r?\n/).map(line => {
            const match = /^\[(\d+),(\d+)\](.*)$/.exec(line);
            if (!match) return '';
            const start = Number(match[1]);
            const pattern = payload.format === 'krc' ? /<(\d+),(\d+),\d+>/g : payload.format === 'qrc' ? /\((\d+),(\d+)\)/g : /\((\d+),(\d+),\d+\)/g;
            const markers = Array.from(match[3].matchAll(pattern));
            const words = markers.map((word, index) => {
                const begin = Number(word[1]) + (payload.format === 'krc' ? start : 0);
                const text = payload.format === 'qrc'
                    ? match[3].slice(index === 0 ? 0 : markers[index - 1].index + markers[index - 1][0].length, word.index)
                    : match[3].slice(word.index + word[0].length, markers[index + 1]?.index ?? match[3].length);
                return `<${stamp(begin)}>${text}<${stamp(begin + Number(word[2]))}>`;
            });
            const original = `[${stamp(start)}]${words.length ? words.join('') : match[3]}`;
            const translation = translations[lyricIndex++]?.trim();
            return translation && translation !== '//' ? `${original}\n[${stamp(start)}] ${translation}` : original;
        }).filter(Boolean).join('\n');
    }
    // Existing LRC enrichment recognizes adjacent, equal-time translations.
    if (payload.translation) {
        const translations = new Map<number, string>();
        const timeMs = (minutes: string, seconds: string) => Math.round((Number(minutes) * 60 + Number(seconds)) * 1000);
        for (const line of payload.translation.split(/\r?\n/)) {
            const match = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(line);
            if (match && match[3].trim() && !(payload.format === 'qrc' && match[3].trim() === '//')) {
                translations.set(timeMs(match[1], match[2]), match[3]);
            }
        }
        content = content.split('\n').flatMap(line => {
            const match = /^\[(\d+):(\d+(?:\.\d+)?)\]/.exec(line);
            if (!match) return [line];
            const start = timeMs(match[1], match[2]);
            // QQ QRC uses milliseconds, but its translated LRC rounds to centiseconds.
            // Use the parser's 30ms merge window, preferring the closest timestamp.
            const closest = [...translations.keys()].filter(time => Math.abs(time - start) <= 30)
                .sort((a, b) => Math.abs(a - start) - Math.abs(b - start))[0];
            const translation = closest === undefined ? undefined : translations.get(closest);
            return translation ? [line, `${match[0]} ${translation}`] : [line];
        }).join('\n');
    }
    return content;
}
