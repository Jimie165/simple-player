import type { CSSProperties } from 'react';

type GridKind = 'cover' | 'video';

type GridConfig = {
    breakpoints: number[];
    columns: number[];
    fallbackLockedWidth: number;
};

const GRID_CONFIGS: Record<GridKind, GridConfig> = {
    cover: {
        breakpoints: [520, 700, 920, 1140, 1360],
        columns: [2, 3, 4, 5, 6, 7],
        fallbackLockedWidth: 208,
    },
    video: {
        breakpoints: [520, 700, 920],
        columns: [2, 3, 4, 5],
        fallbackLockedWidth: 215,
    },
};

export function getGridColumnCount(width: number, kind: GridKind) {
    const { breakpoints, columns } = GRID_CONFIGS[kind];
    let index = 0;

    while (index < breakpoints.length && width >= breakpoints[index]) {
        index += 1;
    }

    return columns[index];
}

function getLockedItemWidth(width: number, gapPx: number, kind: GridKind) {
    const { breakpoints, columns, fallbackLockedWidth } = GRID_CONFIGS[kind];
    let index = 0;

    while (index < breakpoints.length && width >= breakpoints[index]) {
        index += 1;
    }

    const currentColumns = columns[index];
    const nextBreakpoint = breakpoints[index];

    if (!nextBreakpoint) {
        return fallbackLockedWidth;
    }

    return Math.max(
        0,
        Math.floor((nextBreakpoint - gapPx * (currentColumns - 1)) / currentColumns)
    );
}

export function getSparseGridStyle(
    width: number,
    itemCount: number,
    gapPx: number,
    kind: GridKind
): CSSProperties | undefined {
    if (width <= 0 || itemCount <= 0) return undefined;

    const activeColumns = getGridColumnCount(width, kind);
    if (itemCount >= activeColumns) return undefined;

    const lockedItemWidth = getLockedItemWidth(width, gapPx, kind);
    return {
        gridTemplateColumns: `repeat(${itemCount}, minmax(0, ${lockedItemWidth}px))`,
    };
}
