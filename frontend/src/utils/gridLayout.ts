type GridKind = 'cover' | 'video';

/** 列数需与 index.css 中 `.content-grid-*` 的容器查询断点保持一致；lockedWidth 是条目不足一行时的固定卡片宽度。 */
const GRID_CONFIGS: Record<GridKind, { columns: number[]; lockedWidth: number }> = {
    cover: { columns: [2, 3, 4, 5, 6, 7], lockedWidth: 208 },
    video: { columns: [2, 3, 4, 5], lockedWidth: 215 },
};

/**
 * 条目不足一行时，卡片在所有断点下保持同一宽度，而不是被拉伸到整行，也不随断点变宽变窄。
 * 结果是每一档断点的列模板变量，由 CSS 容器查询选择，宽度变化时不经过 JS，也就不会与换列错帧。
 */
export function getSparseGridStyle(itemCount: number, kind: GridKind): Record<string, string> | undefined {
    const { columns, lockedWidth } = GRID_CONFIGS[kind];
    if (itemCount <= 0 || itemCount >= columns[columns.length - 1]) return undefined;

    const style: Record<string, string> = {};
    columns.forEach((count, level) => {
        if (itemCount < count) style[`--grid-columns-${level}`] = `repeat(${itemCount}, minmax(0, ${lockedWidth}px))`;
    });
    return style;
}
