import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';

export type IndexedCharItem = {
    item: FlatCharItem;
    flatIndex: number;
};

export const cjkLayoutCharPattern = /^[\p{Unified_Ideograph}ࠀ-鿼]+$/u;
const whitespaceLayoutCharPattern = /^\s+$/u;

export function groupKaraokeWords(flatChars: FlatCharItem[]): IndexedCharItem[][] {
    const groups: IndexedCharItem[][] = [];
    flatChars.forEach((charItem, flatIndex) => {
        if (!groups[charItem.wordIndex]) {
            groups[charItem.wordIndex] = [];
        }
        groups[charItem.wordIndex].push({ item: charItem, flatIndex });
    });
    return groups;
}

export function groupKaraokeLayout(flatChars: FlatCharItem[]): IndexedCharItem[][] {
    const groups: IndexedCharItem[][] = [];
    let currentGroup: IndexedCharItem[] = [];
    const flushCurrentGroup = () => {
        if (currentGroup.length === 0) return;
        groups.push(currentGroup);
        currentGroup = [];
    };

    flatChars.forEach((charItem, flatIndex) => {
        const indexedChar = { item: charItem, flatIndex };
        if (whitespaceLayoutCharPattern.test(charItem.char)) {
            if (currentGroup.length > 0) {
                currentGroup.push(indexedChar);
                flushCurrentGroup();
            } else if (groups.length > 0) {
                groups[groups.length - 1].push(indexedChar);
            }
            return;
        }
        if (cjkLayoutCharPattern.test(charItem.char)) {
            flushCurrentGroup();
            groups.push([indexedChar]);
            return;
        }
        currentGroup.push(indexedChar);
    });
    flushCurrentGroup();
    return groups;
}

/** Keep timed fragments of a lexical word in one unbreakable layout container. */
export function groupKaraokeWordLayout(
    wordGroups: IndexedCharItem[][],
    layoutGroups: IndexedCharItem[][],
): IndexedCharItem[][][] {
    const layoutIndices = new Map<number, number>();
    layoutGroups.forEach((group, index) => {
        group.forEach(({ flatIndex }) => layoutIndices.set(flatIndex, index));
    });
    const groups: IndexedCharItem[][][] = [];
    let previousLayoutIndex: number | undefined;
    wordGroups.forEach(group => {
        if (!group?.length) return;
        const firstLayoutIndex = layoutIndices.get(group[0].flatIndex);
        if (groups.length > 0 && firstLayoutIndex !== undefined && firstLayoutIndex === previousLayoutIndex) {
            groups[groups.length - 1].push(group);
        } else {
            groups.push([group]);
        }
        previousLayoutIndex = layoutIndices.get(group[group.length - 1].flatIndex);
    });
    return groups;
}
