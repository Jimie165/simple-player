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
    it('leaves a 4px gap after accounting for both round caps', () => {
        const svg = renderProgress(43);
        const path = svg.getElementsByTagName('path')[0];
        const track = svg.getElementsByTagName('line')[0];
        const endpoint = path.getAttribute('d')!.match(/ ([\d.]+) [\d.-]+$/)!;
        const gap = Number(track.getAttribute('x1')) - Number(endpoint[1]) - 4;
        expect(gap).toBeCloseTo(4);
        expect(path.getAttribute('stroke-linecap')).toBe('round');
        expect(track.getAttribute('stroke-linecap')).toBe('round');
        expect(svg.getElementsByTagName('clipPath').length).toBe(0);
        expect(svg.getElementsByTagName('circle').length).toBe(0);
    });

    it('shows only the track at zero and fills the complete width at 100%', () => {
        expect(renderProgress(0).getElementsByTagName('path').length).toBe(0);
        const complete = renderProgress(100);
        expect(complete.getElementsByTagName('line').length).toBe(0);
        expect(complete.getElementsByTagName('path')[0].getAttribute('d')).toMatch(/ L 318 8$/);
        expect(complete.documentElement.getAttribute('aria-valuenow')).toBe('100');
    });
});
