import type { LyricsData, LyricsLine, LyricsWord } from '@/types';

/* ============================================================
 * Script detection helpers — used to tell original lyrics from
 * Chinese translation when splitting a single line or merging
 * two lines that share (almost) the same timestamp.
 * ============================================================ */

const KANA_RE = /[぀-ゟ゠-ヿ]/;          // Hiragana + Katakana
const HAN_RE = /[㐀-䶿一-鿿]/;           // CJK Unified Ideographs
const LATIN_RE = /[A-Za-z]/;
const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏]/;

const hasKana = (s: string) => KANA_RE.test(s);
const hasHan = (s: string) => HAN_RE.test(s);
const hasLatin = (s: string) => LATIN_RE.test(s);
const hasHangul = (s: string) => HANGUL_RE.test(s);

// "Pure Chinese": contains Han, no kana / Latin / Hangul.
// Punctuation and whitespace are ignored implicitly because they don't match
// any of the script regexes above.
const isPureChinese = (s: string) =>
    hasHan(s) && !hasKana(s) && !hasLatin(s) && !hasHangul(s);

/* ============================================================
 * Header (meta-info) detection — these lines should NEVER be
 * split into translation, even if they look pure-Chinese.
 * ============================================================ */

const HEADER_PREFIX_RE =
    /^\s*(作?词|作?曲|编曲|演唱|歌手|歌曲|专辑|制作人|出品人?|混音|和声|监制|录音|母带|Lyricist|Composer|Arranger|Producer|Vocal|Artist|Album|Title)\s*[:：]/i;

const isHeaderLine = (text: string) => HEADER_PREFIX_RE.test(text);

/* ============================================================
 * Enhanced LRC <mm:ss.xx> word timestamps (Apple Music-style
 * karaoke). Returns the per-word tokens plus the cleaned line
 * text (with all inline timestamps stripped) and an optional
 * trailing line-end timestamp.
 * ============================================================ */

const WORD_TIMESTAMP_RE = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const LRC_TIMESTAMP_RE = /\[(\d{2,}):(\d{2})(?:[.:](\d{2,3}))?\]/g;

interface ExtractedWords {
    words: LyricsWord[];
    cleanText: string;
    endMs: number | null;
}

interface InlineSquareStamp {
    idx: number;
    len: number;
    ms: number;
}

interface InlineSquareWords extends ExtractedWords {
    lineTimeMs: number;
}

function timestampMs(minutesRaw: string, secondsRaw: string, fractionRaw?: string): number {
    const minutes = parseInt(minutesRaw, 10);
    const seconds = parseInt(secondsRaw, 10);
    const fraction = fractionRaw ? parseInt(fractionRaw.padEnd(3, '0'), 10) : 0;
    return minutes * 60000 + seconds * 1000 + fraction;
}

function extractWords(text: string): ExtractedWords | null {
    const stamps: { idx: number; len: number; ms: number }[] = [];
    WORD_TIMESTAMP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WORD_TIMESTAMP_RE.exec(text)) !== null) {
        stamps.push({
            idx: m.index,
            len: m[0].length,
            ms: timestampMs(m[1], m[2], m[3]),
        });
    }
    if (stamps.length === 0) return null;

    const words: LyricsWord[] = [];
    let endMs: number | null = null;
    for (let i = 0; i < stamps.length; i++) {
        const segStart = stamps[i].idx + stamps[i].len;
        const segEnd = i + 1 < stamps.length ? stamps[i + 1].idx : text.length;
        const segText = text.slice(segStart, segEnd);
        if (segText.length === 0) {
            // A trailing/empty timestamp segment — treat the latest such
            // stamp as the line end (Apple-style closing marker).
            endMs = stamps[i].ms;
            continue;
        }
        words.push({ time_ms: stamps[i].ms, text: segText });
    }

    if (words.length === 0) return null;

    const cleanText = text.replace(WORD_TIMESTAMP_RE, '').trim();
    return { words, cleanText, endMs };
}

function inlineSquareStampFromMatch(m: RegExpExecArray): InlineSquareStamp {
    return {
        idx: m.index,
        len: m[0].length,
        ms: timestampMs(m[1], m[2], m[3]),
    };
}

function collectInlineSquareStamps(text: string): InlineSquareStamp[] {
    const stamps: InlineSquareStamp[] = [];
    LRC_TIMESTAMP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LRC_TIMESTAMP_RE.exec(text)) !== null) {
        stamps.push(inlineSquareStampFromMatch(m));
    }
    return stamps;
}

function isInlineSquareKaraoke(stamps: InlineSquareStamp[], text: string): boolean {
    if (stamps.length < 2) return false;
    for (let i = 0; i + 1 < stamps.length; i++) {
        const between = text.slice(stamps[i].idx + stamps[i].len, stamps[i + 1].idx);
        if (between.trim().length > 0) return true;
    }
    return false;
}

function tokenizeInlineSquare(stamps: InlineSquareStamp[], text: string): InlineSquareWords | null {
    if (stamps.length === 0) return null;

    const words: LyricsWord[] = [];
    let endMs: number | null = null;

    for (let i = 0; i < stamps.length; i++) {
        const segStart = stamps[i].idx + stamps[i].len;
        const segEnd = i + 1 < stamps.length ? stamps[i + 1].idx : text.length;
        const segText = text.slice(segStart, segEnd);
        if (segText.length === 0) {
            if (i === stamps.length - 1) endMs = stamps[i].ms;
            continue;
        }
        words.push({ time_ms: stamps[i].ms, text: segText });
    }

    if (words.length === 0) return null;

    return {
        words,
        cleanText: words.map((w) => w.text).join(''),
        endMs,
        lineTimeMs: stamps[0].ms,
    };
}

/* ============================================================
 * Inline split — DISABLED.
 *
 * Earlier versions tried to split a single text segment by
 * " / " slash, by trailing "(纯中文)" parenthesis, and by inner
 * space. All three have realistic false-positive cases:
 *   - " / " can appear in genuine lyrics ("Light / Dark").
 *   - "(纯中文)" can be a stylistic single-kanji parenthetical
 *     (e.g. Japanese "星空(星)") rather than a translation.
 *   - Inner space cannot be reliably attributed to language
 *     boundary when the translation itself contains spaces.
 *
 * Per user preference we accept losing translation extraction
 * for these inline forms (line stays as-is, visually tidy)
 * and only recover translation when the LRC file uses the
 * same / near-equal timestamp on a neighbouring line — which
 * is a high-confidence signal handled by mergeAdjacent below.
 * ============================================================ */

function splitInline(_text: string): [string, string] | null {
    void _text;
    return null;
}

/* ============================================================
 * Internal entry used during parsing. `_raw` keeps the original
 * (timestamp-stripped) text including any leading whitespace —
 * the leading-space hint helps us decide which side of a merge
 * pair is the translation.
 * ============================================================ */

interface ParseEntry {
    time_ms: number | null;
    text: string;
    translation: string | null;
    words: LyricsWord[] | null;
    end_ms: number | null;
    _raw: string;
}

const MERGE_WINDOW_MS = 30;

function mergeAdjacent(entries: ParseEntry[]): ParseEntry[] {
    const out: ParseEntry[] = [];
    for (let i = 0; i < entries.length; i++) {
        const cur = entries[i];
        const next = entries[i + 1];
        if (
            next &&
            cur.time_ms !== null &&
            next.time_ms !== null &&
            cur.text.length > 0 &&
            next.text.length > 0 &&
            !cur.translation &&
            !next.translation &&
            Math.abs(next.time_ms - cur.time_ms) <= MERGE_WINDOW_MS &&
            !isHeaderLine(cur.text) &&
            !isHeaderLine(next.text)
        ) {
            const curLeading = /^\s/.test(cur._raw);
            const nextLeading = /^\s/.test(next._raw);
            const curPure = isPureChinese(cur.text);
            const nextPure = isPureChinese(next.text);

            let originalEntry: ParseEntry;
            let translationText: string;

            if (curLeading && !nextLeading) {
                originalEntry = next;
                translationText = cur.text;
            } else if (nextLeading && !curLeading) {
                originalEntry = cur;
                translationText = next.text;
            } else if (curPure && !nextPure) {
                originalEntry = next;
                translationText = cur.text;
            } else if (nextPure && !curPure) {
                originalEntry = cur;
                translationText = next.text;
            } else {
                originalEntry = cur;
                translationText = next.text;
            }

            out.push({
                time_ms: originalEntry.time_ms,
                text: originalEntry.text,
                translation: translationText,
                words: originalEntry.words,
                end_ms: originalEntry.end_ms,
                _raw: originalEntry._raw,
            });
            i++;
            continue;
        }
        out.push(cur);
    }
    return out;
}

/**
 * Apply translation extraction (inline split + adjacent merge) to lines
 * that already have `time_ms` populated (e.g. ID3 SYLT). Lines without
 * timestamps are passed through unchanged.
 */
export function enrichLyricsLines(lines: LyricsLine[]): LyricsLine[] {
    const timed: ParseEntry[] = [];
    const untimed: LyricsLine[] = [];

    for (const l of lines) {
        if (typeof l.time_ms === 'number') {
            // ID3 SYLT lines may also embed enhanced-LRC <> word stamps in
            // their text payload — try to extract them here so SYLT-sourced
            // lyrics get the karaoke effect too.
            const extracted = extractWords(l.text);
            const inlineSquareStamps = extracted ? [] : collectInlineSquareStamps(l.text);
            const inlineSquare =
                !extracted && isInlineSquareKaraoke(inlineSquareStamps, l.text)
                    ? tokenizeInlineSquare(inlineSquareStamps, l.text)
                    : null;
            timed.push({
                time_ms: inlineSquare ? inlineSquare.lineTimeMs : l.time_ms,
                text: extracted ? extracted.cleanText : (inlineSquare ? inlineSquare.cleanText : l.text),
                translation: l.translation ?? null,
                words: extracted ? extracted.words : (inlineSquare ? inlineSquare.words : (l.words ?? null)),
                end_ms:
                    extracted && extracted.endMs !== null
                        ? extracted.endMs
                        : (inlineSquare && inlineSquare.endMs !== null ? inlineSquare.endMs : (l.end_ms ?? null)),
                _raw: l.text,
            });
        } else {
            untimed.push({
                ...l,
                translation: l.translation ?? null,
                words: l.words ?? null,
                end_ms: l.end_ms ?? null,
            });
        }
    }

    timed.sort((a, b) => (a.time_ms ?? 0) - (b.time_ms ?? 0));

    const firstMs = timed.length > 0 ? timed[0].time_ms : null;
    const firstSeen = new Set<number>();
    for (const e of timed) {
        if (e.translation) continue;
        if (isHeaderLine(e.text)) continue;
        if (firstMs !== null && e.time_ms === firstMs && !firstSeen.has(firstMs)) {
            firstSeen.add(firstMs);
            continue;
        }
        const split = splitInline(e.text);
        if (split) {
            e.text = split[0];
            e.translation = split[1];
        }
    }

    const merged = mergeAdjacent(timed);

    const out: LyricsLine[] = [...untimed];
    for (const e of merged) {
        out.push({
            time_ms: e.time_ms,
            text: e.text,
            translation: e.translation,
            words: e.words,
            end_ms: e.end_ms,
        });
    }
    return out;
}

/**
 * Parsed LRC file content into LyricsLine[] with optional translation.
 *
 * Handles:
 *   - Standard "[mm:ss.xx]text"
 *   - Multiple stamps per line "[00:12][00:14]text"
 *   - Translation in same line via " / " or trailing "(译文)"
 *   - Translation in a same/near (±30ms) timestamp neighbour line
 *   - Header lines (作词/作曲/...) and the very first timestamped line
 *     are preserved verbatim — never split.
 */
export function parseLrcStrings(rawLines: LyricsLine[]): LyricsData {
    let hasTimestamps = false;
    const entries: ParseEntry[] = [];
    const metaEntries: ParseEntry[] = [];

    const metaRegExp = /^\[([a-zA-Z]+):(.*?)\].*/;

    /* -------- Step A: expand timestamps -------- */
    for (const lineObj of rawLines) {
        const text = lineObj.text;
        LRC_TIMESTAMP_RE.lastIndex = 0;

        const matches: RegExpExecArray[] = [];
        let m: RegExpExecArray | null;
        while ((m = LRC_TIMESTAMP_RE.exec(text)) !== null) {
            matches.push(m);
        }

        if (matches.length > 0) {
            hasTimestamps = true;
            const stamps = matches.map(inlineSquareStampFromMatch);
            const inlineSquare =
                isInlineSquareKaraoke(stamps, text) ? tokenizeInlineSquare(stamps, text) : null;
            if (inlineSquare) {
                entries.push({
                    time_ms: inlineSquare.lineTimeMs,
                    text: inlineSquare.cleanText,
                    translation: null,
                    words: inlineSquare.words,
                    end_ms: inlineSquare.endMs,
                    _raw: text,
                });
                continue;
            }

            const cleanRaw = text.replace(LRC_TIMESTAMP_RE, '');
            const cleanRawTrimmed = cleanRaw.trim();
            // Try to extract per-word enhanced-LRC timestamps. If found,
            // `lineText` is the human-readable text with all <mm:ss.xx>
            // tags stripped; `words` carries the per-token timing.
            const extracted = extractWords(cleanRawTrimmed);
            const lineText = extracted ? extracted.cleanText : cleanRawTrimmed;
            const words = extracted ? extracted.words : null;
            const lineEndMs = extracted ? extracted.endMs : null;

            for (const mm of matches) {
                const timeMs = timestampMs(mm[1], mm[2], mm[3]);
                // Empty lines like "[00:27.20]" are kept with text === '' so
                // downstream code can treat them as explicit "previous lyric
                // ended" markers (interlude triggers). They are filtered out
                // of normal lyric-row rendering and active-line tracking.
                entries.push({
                    time_ms: timeMs,
                    text: lineText,
                    translation: null,
                    words,
                    end_ms: lineEndMs,
                    _raw: cleanRaw,
                });
            }
        } else {
            const metaMatch = text.match(metaRegExp);
            if (metaMatch) {
                metaEntries.push({
                    time_ms: null,
                    text,
                    translation: null,
                    words: null,
                    end_ms: null,
                    _raw: text,
                });
            } else if (text.trim() !== '') {
                metaEntries.push({
                    time_ms: null,
                    text: text.trim(),
                    translation: null,
                    words: null,
                    end_ms: null,
                    _raw: text,
                });
            }
        }
    }

    /* -------- Sort timed entries -------- */
    entries.sort((a, b) => (a.time_ms ?? 0) - (b.time_ms ?? 0));

    /* -------- Step B: per-line inline split -------- */
    // Find the first timestamped *non-empty* line — empty markers should not
    // claim the "title line" exemption.
    const firstNonEmptyTimed = entries.find((e) => e.text.length > 0);
    const firstTimedMs = firstNonEmptyTimed ? firstNonEmptyTimed.time_ms : null;
    const firstTimedSeen = new Set<number>();

    for (const e of entries) {
        if (e.text.length === 0) continue; // empty marker — leave as-is
        if (isHeaderLine(e.text)) continue;

        if (
            firstTimedMs !== null &&
            e.time_ms === firstTimedMs &&
            !firstTimedSeen.has(firstTimedMs)
        ) {
            firstTimedSeen.add(firstTimedMs);
            continue;
        }

        const split = splitInline(e.text);
        if (split) {
            e.text = split[0];
            e.translation = split[1];
        }
    }

    /* -------- Step C: adjacent-timestamp merge -------- */
    const merged = mergeAdjacent(entries);

    /* -------- Step D: emit -------- */
    const out: LyricsLine[] = [];
    // meta tags first (matches previous behaviour)
    for (const e of metaEntries) {
        out.push({ time_ms: null, text: e.text, translation: null, words: null, end_ms: null });
    }
    for (const e of merged) {
        out.push({
            time_ms: e.time_ms,
            text: e.text,
            translation: e.translation,
            words: e.words,
            end_ms: e.end_ms,
        });
    }

    return {
        lines: out,
        has_timestamps: hasTimestamps,
    };
}
