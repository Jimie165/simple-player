import type {
    LyricsAgent,
    LyricsDocument,
    LyricsLine,
    LyricsMetadata,
    LyricsTimingMode,
    LyricsWord,
} from '@/types';

const NS_TTM = 'http://www.w3.org/ns/ttml#metadata';
const NS_ITUNES = 'http://music.apple.com/lyric-ttml-internal';
const NS_ITUNES_LEGACY = 'http://www.apple.com/lyric-ttml-internal';
const NS_XML = 'http://www.w3.org/XML/1998/namespace';

const ITUNES_NAMESPACES = [NS_ITUNES, NS_ITUNES_LEGACY];

// 可注入解析器：浏览器 DOMParser 与测试用的 @xmldom/xmldom 均满足该结构
export interface LyricsDomParser {
    parseFromString(text: string, mimeType: string): Document;
}

export interface ParseTtmlLyricsOptions {
    domParser?: LyricsDomParser;
    sourcePath?: string | null;
}

interface TtmlWord {
    start: number;
    end: number;
    text: string;
}

interface TtmlBackground {
    text: string;
    words: TtmlWord[];
    start: number | null;
    end: number | null;
}

interface TtmlContent {
    text: string;
    words: TtmlWord[];
    translation: string | null;
    romanization: string | null;
    background: TtmlBackground | null;
}

interface TtmlSidecarText {
    main: string;
    background: string | null;
}

interface TtmlParsedHead {
    metadata: LyricsMetadata;
    sidecarTranslations: Map<string, TtmlSidecarText>;
    sidecarTransliterations: Map<string, TtmlSidecarText>;
}

const MULTI_SPACE_RE = /\s+/g;

function normalizeText(raw: string | null | undefined, trim = false): string {
    if (!raw) return '';
    const normalized = raw.replace(MULTI_SPACE_RE, ' ');
    return trim ? normalized.trim() : normalized;
}

function getLocalName(element: Element): string {
    return element.localName || (element.nodeName.includes(':') ? element.nodeName.split(':').pop()! : element.nodeName);
}

function descendantElements(element: Element): Element[] {
    const result: Element[] = [];
    for (const child of Array.from(element.children)) {
        result.push(child);
        result.push(...descendantElements(child));
    }
    return result;
}

const TIME_RE = /^(?:(?:(?<hours>\d+):)?(?<minutes>\d+):)?(?<seconds>\d+(?:\.\d+)?)$/;

export function parseTtmlTime(value: string | null | undefined): number | null {
    if (!value) return null;
    const clean = value.trim();
    if (!clean) return null;
    if (clean.endsWith('s')) {
        const seconds = Number(clean.slice(0, -1));
        return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
    }
    const match = clean.match(TIME_RE);
    if (!match?.groups) return null;
    const seconds = Number(match.groups.seconds);
    const minutes = match.groups.minutes ? parseInt(match.groups.minutes, 10) : 0;
    const hours = match.groups.hours ? parseInt(match.groups.hours, 10) : 0;
    if (!Number.isFinite(seconds)) return null;
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

function getAttr(element: Element, namespace: string, localName: string): string | null {
    const namespaced = element.getAttributeNS(namespace, localName);
    if (namespaced) return namespaced;
    if (!element.hasAttributes()) return null;
    for (const attr of Array.from(element.attributes)) {
        const attrLocalName = attr.localName || (attr.nodeName.includes(':') ? attr.nodeName.split(':').pop() : attr.nodeName);
        if (attrLocalName === localName) return attr.value;
    }
    return null;
}

function getITunesAttr(element: Element, localName: string): string | null {
    for (const ns of ITUNES_NAMESPACES) {
        const value = element.getAttributeNS(ns, localName);
        if (value) return value;
    }
    return getAttr(element, NS_ITUNES, localName);
}

// begin/end/dur 解析；dur 仅在没有 end 时作为 end 的推导
function getTiming(element: Element): { begin: number | null; end: number | null } {
    const begin = parseTtmlTime(getAttr(element, NS_XML, 'begin'));
    const end = parseTtmlTime(getAttr(element, NS_XML, 'end'));
    const dur = parseTtmlTime(getAttr(element, NS_XML, 'dur'));
    let effectiveEnd = end;
    if (effectiveEnd === null && begin !== null && dur !== null) {
        effectiveEnd = begin + dur;
    }
    return { begin, end: effectiveEnd };
}

function stripBackgroundParens(text: string): string {
    return text.replace(/^[(（]+/, '').replace(/[)）]+$/, '').trim();
}

// 解析 <p> 的混合内容：主唱 span 逐字时间、纯文本、x-bg / x-translation / x-roman。
// span 之间的空白并入前一个 word 的 text（保持 "You come" 类渲染兼容）。
function parseContent(element: Element): TtmlContent {
    let text = '';
    const words: TtmlWord[] = [];
    let translation: string | null = null;
    let romanization: string | null = null;
    let background: TtmlBackground | null = null;

    for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === 3) {
            const raw = child.textContent ?? '';
            const isFormattingWhitespace = raw.includes('\n') && raw.trim() === '';
            if (isFormattingWhitespace) continue;
            const normalized = normalizeText(raw);
            if (normalized.trim() === '') {
                if (words.length > 0) words[words.length - 1].text += ' ';
                text += normalized;
                continue;
            }
            text += normalized;
            continue;
        }
        if (child.nodeType !== 1) continue;
        const el = child as Element;
        const role = getAttr(el, NS_TTM, 'role');
        if (role === 'x-bg') {
            background = parseBackground(el);
            continue;
        }
        if (role === 'x-translation') {
            translation = normalizeText(el.textContent, true);
            continue;
        }
        if (role === 'x-roman') {
            romanization = normalizeText(el.textContent, true);
            continue;
        }
        const { begin, end } = getTiming(el);
        if (begin !== null && end !== null) {
            const rawText = normalizeText(el.textContent);
            text += rawText;
            const cleanText = rawText.trim();
            if (cleanText.length > 0) words.push({ start: begin, end, text: cleanText });
            continue;
        }
        text += normalizeText(el.textContent);
    }

    return {
        text: normalizeText(text, true),
        words,
        translation,
        romanization,
        background,
    };
}

// x-bg 内部同样按 span 拆词，并去掉首尾括号。
// 背景行时间优先取自身 word 时间，外层 span begin/end 仅作回退。
function parseBackground(element: Element): TtmlBackground {
    let text = '';
    const words: TtmlWord[] = [];
    const { begin: bgBegin, end: bgEnd } = getTiming(element);

    for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === 3) {
            const raw = child.textContent ?? '';
            const isFormattingWhitespace = raw.includes('\n') && raw.trim() === '';
            if (isFormattingWhitespace) continue;
            const normalized = normalizeText(raw);
            if (normalized.trim() === '') {
                if (words.length > 0) words[words.length - 1].text += ' ';
                text += normalized;
                continue;
            }
            text += normalized;
            continue;
        }
        if (child.nodeType !== 1) continue;
        const el = child as Element;
        const { begin, end } = getTiming(el);
        const rawText = normalizeText(el.textContent);
        text += rawText;
        if (begin !== null && end !== null) {
            const cleanText = rawText.trim();
            if (cleanText.length > 0) words.push({ start: begin, end, text: cleanText });
        }
    }

    const cleanedText = stripBackgroundParens(normalizeText(text, true));
    if (words.length > 0) {
        words[0].text = words[0].text.replace(/^[(（]+/, '').trimStart();
        words[words.length - 1].text = words[words.length - 1].text.replace(/[)）]+$/, '').trimEnd();
        return {
            text: cleanedText,
            words,
            start: words[0].start ?? bgBegin,
            end: words[words.length - 1].end ?? bgEnd,
        };
    }
    return { text: cleanedText, words, start: bgBegin, end: bgEnd };
}

// Apple sidecar（translations / transliterations）中的 <text for="L1">，可内嵌 x-bg 译文
function parseSidecarContent(element: Element): TtmlSidecarText {
    let main = '';
    let background: string | null = null;
    for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === 3) {
            main += normalizeText(child.textContent);
            continue;
        }
        if (child.nodeType !== 1) continue;
        const el = child as Element;
        const role = getAttr(el, NS_TTM, 'role');
        if (role === 'x-bg') {
            background = stripBackgroundParens(normalizeText(el.textContent, true));
            continue;
        }
        main += normalizeText(el.textContent);
    }
    return { main: normalizeText(main, true), background };
}

function parseHead(head: Element): TtmlParsedHead {
    const metadata: LyricsMetadata = {};
    const sidecarTranslations = new Map<string, TtmlSidecarText>();
    const sidecarTransliterations = new Map<string, TtmlSidecarText>();
    const agents: LyricsAgent[] = [];

    const collectSidecar = (container: Element, target: Map<string, TtmlSidecarText>) => {
        for (const textEl of descendantElements(container)) {
            if (getLocalName(textEl) !== 'text') continue;
            const forKey = getITunesAttr(textEl, 'for');
            if (!forKey) continue;
            if (!target.has(forKey)) target.set(forKey, parseSidecarContent(textEl));
        }
    };

    for (const el of descendantElements(head)) {
        const localName = getLocalName(el);
        if (localName === 'agent') {
            const id = getAttr(el, NS_XML, 'id');
            if (!id) continue;
            const type = getAttr(el, NS_TTM, 'type') ?? null;
            const nameEl = descendantElements(el).find((d) => getLocalName(d) === 'name');
            const name = nameEl ? normalizeText(nameEl.textContent, true) : '';
            agents.push({ id, type, name: name || null });
        } else if (localName === 'songwriter') {
            const name = normalizeText(el.textContent, true);
            if (name) (metadata.songwriters ??= []).push(name);
        } else if (localName === 'translation') {
            collectSidecar(el, sidecarTranslations);
        } else if (localName === 'transliteration') {
            collectSidecar(el, sidecarTransliterations);
        }
    }

    if (agents.length > 0) metadata.agents = agents;
    return { metadata, sidecarTranslations, sidecarTransliterations };
}

interface TtmlParsedBody {
    lines: LyricsLine[];
    hasWords: boolean;
}

function parseBody(
    body: Element,
    sidecarTranslations: Map<string, TtmlSidecarText>,
    sidecarTransliterations: Map<string, TtmlSidecarText>,
    agents: LyricsAgent[]
): TtmlParsedBody {
    const lines: LyricsLine[] = [];
    let hasWords = false;
    let internalIndex = 0;

    // Apple Music 风格对唱识别：
    // group 类型（合唱）永远非对唱且不参与交替；无 agent 行归为默认 v1；
    // 交替出现的不同 person agent 构成左右对唱，相同 agent 保持原侧。
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    let lastPersonAgentId: string | null = null;
    let lastPersonIsDuet = false;

    const processLine = (p: Element, songPart: string | null) => {
        const key = getITunesAttr(p, 'key');
        const id = key ?? `line-${internalIndex + 1}`;
        internalIndex++;

        const agentId = getAttr(p, NS_TTM, 'agent');
        const agentKey = agentId ?? 'v1';
        const agent = agentById.get(agentKey);
        const isGroup = agent?.type === 'group';
        let isDuet = false;
        if (!isGroup) {
            if (lastPersonAgentId === null) {
                // 第一个非合唱演唱者：other 类型（伴唱角色）强制对唱
                isDuet = agent?.type === 'other';
                lastPersonAgentId = agentKey;
                lastPersonIsDuet = isDuet;
            } else if (lastPersonAgentId === agentKey) {
                isDuet = lastPersonIsDuet;
            } else {
                isDuet = !lastPersonIsDuet;
                lastPersonAgentId = agentKey;
                lastPersonIsDuet = isDuet;
            }
        }
        const content = parseContent(p);
        const { begin: pBegin, end: pEnd } = getTiming(p);

        const words: LyricsWord[] = content.words.map((w) => ({
            start_time_ms: w.start,
            end_time_ms: w.end,
            text: w.text,
        }));
        if (words.length > 0) hasWords = true;

        // Apple 行模型（Lyrics.init 的 MSVLyricsLine.startTime/endTime）：行起止以 <p>
        // 自身 begin/end 为准（含背景和声尾段），词时间仅用于逐词渐变；缺 <p> 时间时回退首/末词。
        // 注意：不把 <p> 整行文本回退成单 word——逐行 TTML 的行只该有行时序，
        // 单 word 会让渲染层误判为逐字（Karaoke 逐字渐变），与逐行 LRC（words=[]）不一致。
        const mainStart = pBegin ?? (words.length > 0 ? words[0].start_time_ms : null);
        const mainEnd = pEnd ?? (words.length > 0 ? words[words.length - 1].end_time_ms : null);

        const sidecarTranslation = sidecarTranslations.get(id);
        const sidecarTransliteration = sidecarTransliterations.get(id);

        lines.push({
            id,
            parent_id: null,
            role: 'main',
            start_time_ms: mainStart ?? null,
            end_time_ms: mainEnd ?? null,
            text: content.text,
            words,
            translation: content.translation ?? sidecarTranslation?.main ?? null,
            romanization: content.romanization ?? sidecarTransliteration?.main ?? null,
            agent_id: agentId ?? null,
            is_duet: isDuet,
            section: songPart ?? null,
        });

        const background = content.background;
        if (background) {
            const bgWords: LyricsWord[] = background.words.map((w) => ({
                start_time_ms: w.start,
                end_time_ms: w.end,
                text: w.text,
            }));
            if (bgWords.length > 0) hasWords = true;
            lines.push({
                id: `${id}-bg`,
                parent_id: id,
                role: 'background',
                start_time_ms: bgWords.length > 0 ? bgWords[0].start_time_ms : background.start,
                end_time_ms:
                    bgWords.length > 0
                        ? bgWords[bgWords.length - 1].end_time_ms ?? background.end
                        : background.end,
                text: background.text,
                words: bgWords,
                translation: sidecarTranslation?.background ?? null,
                romanization: sidecarTransliteration?.background ?? null,
                agent_id: null,
                is_duet: false,
                section: songPart ?? null,
            });
        }
    };

    for (const element of Array.from(body.children)) {
        const localName = getLocalName(element);
        if (localName === 'div') {
            const songPart = getITunesAttr(element, 'songPart') ?? getITunesAttr(element, 'song-part');
            for (const p of descendantElements(element)) {
                if (getLocalName(p) === 'p') processLine(p, songPart);
            }
        } else if (localName === 'p') {
            processLine(element, null);
        }
    }

    return { lines, hasWords };
}

export function parseTtmlLyrics(rawText: string, options: ParseTtmlLyricsOptions = {}): LyricsDocument {
    const { sourcePath = null } = options;
    let domParser = options.domParser;
    if (!domParser) {
        if (typeof DOMParser === 'undefined') {
            throw new Error('解析 TTML 歌词失败：当前环境没有 DOMParser');
        }
        domParser = new DOMParser();
    }
    const context = sourcePath ? `（${sourcePath}）` : '';

    let document: Document;
    try {
        document = domParser.parseFromString(rawText, 'application/xml');
    } catch {
        throw new Error(`解析 TTML 歌词失败：XML 无效${context}`);
    }
    if (document.getElementsByTagName('parsererror').length > 0) {
        throw new Error(`解析 TTML 歌词失败：XML 无效${context}`);
    }
    const root = document.documentElement;
    if (!root || getLocalName(root) !== 'tt') {
        throw new Error(`解析 TTML 歌词失败：不是有效的 TTML 文档${context}`);
    }

    const language = getAttr(root, NS_XML, 'lang') ?? null;
    const timingAttr = getITunesAttr(root, 'timing');

    let metadata: LyricsMetadata = { language };
    let sidecarTranslations = new Map<string, TtmlSidecarText>();
    let sidecarTransliterations = new Map<string, TtmlSidecarText>();
    const head = descendantElements(root).find((el) => getLocalName(el) === 'head');
    if (head) {
        const parsed = parseHead(head);
        metadata = { language, ...parsed.metadata };
        sidecarTranslations = parsed.sidecarTranslations;
        sidecarTransliterations = parsed.sidecarTransliterations;
    }

    let lines: LyricsLine[] = [];
    let hasWords = false;
    const body = descendantElements(root).find((el) => getLocalName(el) === 'body');
    if (body) {
        const parsed = parseBody(body, sidecarTranslations, sidecarTransliterations, metadata.agents ?? []);
        lines = parsed.lines;
        hasWords = parsed.hasWords;
    }

    let timingMode: LyricsTimingMode;
    if (timingAttr) {
        timingMode = timingAttr.toLowerCase() === 'word' ? 'word' : 'line';
    } else {
        timingMode = hasWords ? 'word' : 'line';
    }

    return {
        model: 'ttml',
        origin: 'native-ttml',
        timing_mode: timingMode,
        lines,
        metadata,
        offset_ms: 0,
    };
}
