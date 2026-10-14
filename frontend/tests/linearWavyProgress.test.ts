import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DOMParser } from '@xmldom/xmldom';
import { LinearWavyProgress } from '@/features/player/video/LinearWavyProgress';

function renderProgress(percent: number) {
    return new DOMParser().parseFromString(
        renderToStaticMarkup(createElement(LinearWavyProgress, { percent })),
        'image/svg+xml',
    );
}

describe('video preparation wavy progress', () => {
    it('shows only the track at zero and fills the complete width at 100%', () => {
        expect(renderProgress(0).getElementsByTagName('path').length).toBe(0);
        const complete = renderProgress(100);
        expect(complete.getElementsByTagName('line').length).toBe(0);
        expect(complete.documentElement.getAttribute('aria-valuenow')).toBe('100');
    });
});
