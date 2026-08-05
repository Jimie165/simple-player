import type { BackendTimedLyricsLine, LyricsDocument } from '@/types';
import { isLikelyTtmlText } from '@/utils/lyrics/detectLyricsFormat';
import { convertLrcToLyricsDocument } from '@/utils/lyrics/convertLrcToLyricsDocument';
import { convertTimedLinesToLyricsDocument } from '@/utils/lyrics/convertTimedLinesToLyricsDocument';
import { createPlainLyricsDocument } from '@/utils/lyrics/createPlainLyricsDocument';
import { normalizeLyricsDocument } from '@/utils/lyrics/normalizeLyricsDocument';
import { parseTtmlLyrics, type LyricsDomParser } from '@/utils/lyrics/parseTtmlLyrics';
import { applyLyricsOffset } from '@/utils/lyrics/applyLyricsOffset';

export interface ParseLyricsOptions {
    rawText?: string | null;
    timedLines?: BackendTimedLyricsLine[] | null;
    sourcePath?: string | null;
    offsetMs?: number;
    domParser?: LyricsDomParser;
}

// 唯一解析入口：所有输入（TTML / LRC / SYLT / 纯文本）都转换为
// 统一的 LyricsDocument。TTML 检测必须先于 LRC 检测，
// 以 `<tt` 开头的无效 XML 直接报错，不回退为纯文本。
// offset 在完整解析 + 规范化之后一次性应用。
export function parseLyrics(options: ParseLyricsOptions): LyricsDocument {
    const { rawText, timedLines, sourcePath = null, offsetMs = 0, domParser } = options;

    let document: LyricsDocument;
    if (rawText) {
        document = isLikelyTtmlText(rawText)
            ? parseTtmlLyrics(rawText, { domParser, sourcePath })
            : convertLrcToLyricsDocument(rawText);
    } else if (timedLines && timedLines.length > 0) {
        document = timedLines.some((line) => typeof line.time_ms === 'number')
            ? convertTimedLinesToLyricsDocument(timedLines)
            : createPlainLyricsDocument(timedLines);
    } else {
        document = createPlainLyricsDocument(timedLines ?? []);
    }

    const normalized = normalizeLyricsDocument(document);
    return applyLyricsOffset(normalized, offsetMs ?? 0);
}
