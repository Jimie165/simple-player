import { describe, expect, it } from 'vitest';
import { compareNames } from '@/utils/textCompare';

describe('compareNames', () => {
    it('puts ASCII-leading names before others and sorts numbers naturally', () => {
        const names = ['歌单 10', 'Beta', '歌单 2', 'alpha', 'Item 10', 'Item 2'];
        expect([...names].sort(compareNames)).toEqual(['alpha', 'Beta', 'Item 2', 'Item 10', '歌单 2', '歌单 10']);
    });
});
