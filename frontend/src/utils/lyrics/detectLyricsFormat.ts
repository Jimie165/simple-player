// 歌词格式检测。TTML 检测必须先于 LRC 检测：
// 以 `<tt` 开头的文本按 TTML 解析，XML 无效时报错而不是回退成纯文本。

const TTML_ROOT_RE = /^\uFEFF?\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<tt\b[\s>]/i;

export function isLikelyTtmlText(rawText: string): boolean {
    return TTML_ROOT_RE.test(rawText);
}
