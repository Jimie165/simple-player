/** 名称排序：ASCII 开头在前，其余按 zh-CN 数字感知排序（升序）。 */
export function compareNames(a: string, b: string): number {
    const isAsciiA = a.length > 0 && a.charCodeAt(0) <= 0x7F;
    const isAsciiB = b.length > 0 && b.charCodeAt(0) <= 0x7F;
    if (isAsciiA !== isAsciiB) return isAsciiA ? -1 : 1;
    return a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' });
}
