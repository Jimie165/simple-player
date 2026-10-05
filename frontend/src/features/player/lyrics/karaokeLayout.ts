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
