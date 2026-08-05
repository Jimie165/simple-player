import type {
    LyricsDocument,
    LyricsLine,
    LyricsLineRole,
    LyricsTimingMode,
    LyricsWord,
} from '@/types';
import {
    LRC_TIMESTAMP_RE,
    analyzeInlineSquareKaraoke,
    classifyInlineSquareLine,
    collectInlineSquareStamps,
    timestampMs,
    tokenizeInlineSquare,
} from '@/utils/inlineSquareKaraoke';

// 中间词模型：end_time_ms 可选，在行级收尾时按规则推导
export type LrcParsedWord = LyricsWord;

export interface LrcParsedEntry {
    time_ms: number | null;
    text: string;
    translation: string | null;
    words: LrcParsedWord[] | null;
    end_ms: number | null;
    _raw: string;
}

export interface LrcUntimedEntry {
    text: string;
    translation: string | null;
}

/* ============================================================
 * 元数据行识别 —— 这些行永远不参与翻译合并
 * ============================================================ */

const HEADER_PREFIX_RE =
    /^\s*(作?词|作?曲|编曲|演唱|歌手|歌曲|专辑|制作人|出品人?|混音|和声|监制|录音|母带|Lyricist|Composer|Arranger|Producer|Vocal|Artist|Album|Title)\s*[:：]/i;

export function isHeaderLine(text: string): boolean {
    return HEADER_PREFIX_RE.test(text);
}

const LRC_META_RE = /^\[([a-zA-Z]+):(.*?)\].*/;

/* ============================================================
 * 文字体系判断 —— 区分原文与中文翻译
 * ============================================================ */

const KANA_RE = /[぀-ゟ゠-ヿ]/;          // Hiragana + Katakana
const HAN_RE = /[㐀-䶿一-鿿]/;           // CJK Unified Ideographs
const LATIN_RE = /[A-Za-z]/;
const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏]/;

const hasKana = (s: string) => KANA_RE.test(s);
const hasHan = (s: string) => HAN_RE.test(s);
const hasLatin = (s: string) => LATIN_RE.test(s);
const hasHangul = (s: string) => HANGUL_RE.test(s);

// "纯中文"：含汉字，不含假名 / 拉丁 / 谚文（标点和空白天然不命中任何字符集）
const isPureChinese = (s: string) =>
    hasHan(s) && !hasKana(s) && !hasLatin(s) && !hasHangul(s);

/* ============================================================
 * 增强 LRC <mm:ss.xx> 逐字时间戳
 * ============================================================ */

const WORD_TIMESTAMP_RE = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;

export interface EnhancedWordsResult {
    words: LrcParsedWord[];
    cleanText: string;
    endMs: number | null;
}

export function extractEnhancedWords(text: string): EnhancedWordsResult | null {
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

    const words: LrcParsedWord[] = [];
    let endMs: number | null = null;
    for (let i = 0; i < stamps.length; i++) {
        const segStart = stamps[i].idx + stamps[i].len;
        const segEnd = i + 1 < stamps.length ? stamps[i + 1].idx : text.length;
        const segText = text.slice(segStart, segEnd);
        if (segText.length === 0) {
            // 行尾空时间戳：最近一次作为行结束戳，同时作为前一个词的明确结束时间
            // （旧实现存 duration 再相加；此处 end_time_ms 即绝对时间）
            endMs = stamps[i].ms;
            if (words.length > 0) {
                const prevWord = words[words.length - 1];
                if (prevWord.end_time_ms === undefined) {
                    prevWord.end_time_ms = stamps[i].ms;
                }
            }
            continue;
        }
        words.push({ start_time_ms: stamps[i].ms, text: segText });
    }

    if (words.length === 0) return null;

    const cleanText = text.replace(WORD_TIMESTAMP_RE, '').trim();
    return { words, cleanText, endMs };
}

/* ============================================================
 * 同时间 / 近时间（±30ms）翻译合并
 * ============================================================ */

const MERGE_WINDOW_MS = 30;

export function mergeLrcEntries(entries: LrcParsedEntry[]): LrcParsedEntry[] {
    const out: LrcParsedEntry[] = [];
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

            let originalEntry: LrcParsedEntry;
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

/* ============================================================
 * 行级收尾：推导 line end 与 word end
 *
 * word end 优先级：明确结束戳 → 下一个 word start
 * 最后一个 word end：行结束戳 → 下一行 start → 现有回退（+600ms）
 * line end：行结束戳 → 下一有效时间（空行时间戳形成空奏/时间标记）
 * ============================================================ */

export function buildLyricsLinesFromEntries(
    untimed: LrcUntimedEntry[],
    timed: LrcParsedEntry[]
): LyricsLine[] {
    const lines: LyricsLine[] = [];
    let index = 0;
    const nextId = () => `line-${++index}`;

    for (const u of untimed) {
        lines.push({
            id: nextId(),
            parent_id: null,
            role: 'main',
            start_time_ms: null,
            end_time_ms: null,
            text: u.text,
            words: [],
            translation: u.translation,
        });
    }

    for (let i = 0; i < timed.length; i++) {
        const entry = timed[i];
        const nextStart = i + 1 < timed.length ? timed[i + 1].time_ms : null;
        const lineEndMs = entry.end_ms ?? nextStart;

        const words: LyricsWord[] = (entry.words ?? []).map((word, wordIndex, all) => {
            if (word.end_time_ms !== undefined || wordIndex + 1 < all.length) {
                return {
                    start_time_ms: word.start_time_ms,
                    end_time_ms: word.end_time_ms ?? all[wordIndex + 1].start_time_ms,
                    text: word.text,
                };
            }
            // 最后词无显式结束（无行尾戳）：隐式词尾，保持缺失，
            // 视觉层按旧规则（800ms 上限 + 行结束/下一行起始/ +600ms 兜底）推导
            return { start_time_ms: word.start_time_ms, text: word.text };
        });

        const role: LyricsLineRole =
            entry.text.length === 0 && entry.time_ms !== null ? 'timing-marker' : 'main';

        lines.push({
            id: nextId(),
            parent_id: null,
            role,
            start_time_ms: entry.time_ms,
            end_time_ms: lineEndMs,
            text: entry.text,
            words,
            translation: entry.translation,
        });
    }

    return lines;
}

export function convertLrcToLyricsDocument(rawText: string): LyricsDocument {
    const rawLines = rawText.split(/\r?\n/);
    let hasTimestamps = false;
    const entries: LrcParsedEntry[] = [];
    const metaEntries: LrcParsedEntry[] = [];
    const inlineSquareAnalysis = analyzeInlineSquareKaraoke(rawLines);

    /* -------- Step A: 展开时间戳 -------- */
    for (const text of rawLines) {
        LRC_TIMESTAMP_RE.lastIndex = 0;
        const matches: RegExpExecArray[] = [];
        let m: RegExpExecArray | null;
        while ((m = LRC_TIMESTAMP_RE.exec(text)) !== null) {
            matches.push(m);
        }

        if (matches.length > 0) {
            hasTimestamps = true;
            const stamps = collectInlineSquareStamps(text);
            const inlineSquareDecision = classifyInlineSquareLine(stamps, text, {
                ...inlineSquareAnalysis,
                forceInlineSquareKaraoke: false,
            });
            const inlineSquare =
                inlineSquareDecision.kind === 'karaoke' ? tokenizeInlineSquare(stamps, text) : null;
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
            if (inlineSquareDecision.kind === 'lineEndOnly') {
                entries.push({
                    time_ms: inlineSquareDecision.lineTimeMs,
                    text: inlineSquareDecision.cleanText,
                    translation: null,
                    words: null,
                    end_ms: inlineSquareDecision.endMs,
                    _raw: text,
                });
                continue;
            }

            const cleanRaw = text.replace(LRC_TIMESTAMP_RE, '');
            const cleanRawTrimmed = cleanRaw.trim();
            const extracted = extractEnhancedWords(cleanRawTrimmed);
            const lineText = extracted ? extracted.cleanText : cleanRawTrimmed;
            const words = extracted ? extracted.words : null;
            const lineEndMs = extracted ? extracted.endMs : null;

            for (const mm of matches) {
                const timeMs = timestampMs(mm[1], mm[2], mm[3]);
                // 空行 "[00:27.20]" 保留空 text，转换后成为 timing-marker（空奏/行结束标记）
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
            const metaMatch = text.match(LRC_META_RE);
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

    /* -------- 排序时间项 -------- */
    entries.sort((a, b) => (a.time_ms ?? 0) - (b.time_ms ?? 0));

    /* -------- 近时间翻译合并 -------- */
    const merged = mergeLrcEntries(entries);

    /* -------- 输出 -------- */
    const lines = buildLyricsLinesFromEntries(
        metaEntries.map((e) => ({ text: e.text, translation: e.translation })),
        merged
    );

    let timingMode: LyricsTimingMode = 'none';
    if (hasTimestamps) {
        timingMode = lines.some((line) => line.words.length > 0) ? 'word' : 'line';
    }

    return {
        model: 'ttml',
        origin: hasTimestamps ? 'lrc' : 'plain',
        timing_mode: timingMode,
        lines,
        metadata: {},
        offset_ms: 0,
    };
}
