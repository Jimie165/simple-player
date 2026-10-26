import { QuantizerWu, hexFromArgb } from '@material/material-color-utilities';

export interface ArtworkTheme {
    background: string;
    sidebarBackground: string;
    isDark: boolean;
}

type Oklab = { lightness: number; a: number; b: number };

function toOklab(color: number): Oklab {
    const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const r = linear((color >>> 16) & 255);
    const g = linear((color >>> 8) & 255);
    const b = linear(color & 255);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
        lightness: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    };
}

function fromOklab({ lightness, a, b }: Oklab): number {
    const channels = (chroma: number) => {
        const l = (lightness + 0.3963377774 * a * chroma + 0.2158037573 * b * chroma) ** 3;
        const m = (lightness - 0.1055613458 * a * chroma - 0.0638541728 * b * chroma) ** 3;
        const s = (lightness - 0.0894841775 * a * chroma - 1.2914855480 * b * chroma) ** 3;
        return [
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
        ];
    };
    // Reduce chroma only when the new lightness moves the color outside sRGB.
    let low = 0;
    let high = 1;
    let rgb = channels(high);
    if (rgb.some(value => value < -0.000001 || value > 1.000001)) {
        for (let i = 0; i < 12; i++) {
            const middle = (low + high) / 2;
            if (channels(middle).every(value => value >= 0 && value <= 1)) low = middle;
            else high = middle;
        }
        rgb = channels(low);
    }
    const encoded = rgb.map(value => {
        const channel = Math.max(0, Math.min(1, value));
        return Math.round(255 * (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055));
    });
    return (0xff000000 | (encoded[0] << 16) | (encoded[1] << 8) | encoded[2]) >>> 0;
}

function sameFamily(first: Oklab, second: Oklab): boolean {
    if (Math.abs(first.lightness - second.lightness) > 0.2) return false;
    const firstChroma = Math.hypot(first.a, first.b);
    const secondChroma = Math.hypot(second.a, second.b);
    // Pale tints may merge with white; all other colors must also agree in hue.
    if (Math.min(firstChroma, secondChroma) < 0.025) return Math.max(firstChroma, secondChroma) < 0.045;
    if (Math.min(firstChroma, secondChroma) / Math.max(firstChroma, secondChroma) < 0.5) return false;
    const angle = Math.abs(Math.atan2(first.b, first.a) - Math.atan2(second.b, second.a));
    return Math.min(angle, 2 * Math.PI - angle) < Math.PI / 6;
}

/** Keep spatial evidence so foreground accents cannot win on saturation alone. */
export function selectArtworkColor(pixels: Uint8ClampedArray, width: number): number | null {
    const size = pixels.length / 4;
    if (!Number.isInteger(width) || width < 1 || !Number.isInteger(size) || size === 0 || size % width !== 0) return null;
    const height = size / width;
    const samples: number[] = [];
    const positions: number[] = [];
    for (let i = 0; i < size; i++) {
        if (pixels[i * 4 + 3] < 128) continue;
        samples.push((0xff000000 | (pixels[i * 4] << 16) | (pixels[i * 4 + 1] << 8) | pixels[i * 4 + 2]) >>> 0);
        positions.push(i);
    }
    if (samples.length === 0) return null;

    const palette = new QuantizerWu().quantize(samples, 16).map(toOklab);
    const populations = palette.map(() => 0);
    const edges = palette.map(() => 0);
    const labels = new Int16Array(size).fill(-1);
    const edgeWidth = Math.max(1, Math.floor(Math.min(width, height) / 16));
    let edgeCount = 0;
    samples.forEach((sample, index) => {
        const lab = toOklab(sample);
        let nearest = 0;
        let distance = Infinity;
        palette.forEach((candidate, candidateIndex) => {
            const next = (lab.lightness - candidate.lightness) ** 2 + (lab.a - candidate.a) ** 2 + (lab.b - candidate.b) ** 2;
            if (next < distance) {
                nearest = candidateIndex;
                distance = next;
            }
        });
        const position = positions[index];
        const x = position % width;
        const y = Math.floor(position / width);
        labels[position] = nearest;
        populations[nearest]++;
        if (Math.min(x, y, width - 1 - x, height - 1 - y) < edgeWidth) {
            edges[nearest]++;
            edgeCount++;
        }
    });

    let bestScore = -1;
    let selected: boolean[] = [];
    for (const candidate of palette) {
        const family = palette.map(color => sameFamily(candidate, color));
        let population = 0;
        let edgePopulation = 0;
        family.forEach((included, index) => {
            if (!included) return;
            population += populations[index];
            edgePopulation += edges[index];
        });
        const visited = new Uint8Array(size);
        let largestRegion = 0;
        for (const start of positions) {
            if (visited[start] || !family[labels[start]]) continue;
            const queue = [start];
            visited[start] = 1;
            for (let cursor = 0; cursor < queue.length; cursor++) {
                const position = queue[cursor];
                const x = position % width;
                const neighbors = [x > 0 ? position - 1 : -1, x < width - 1 ? position + 1 : -1, position - width, position + width];
                for (const next of neighbors) {
                    if (next < 0 || next >= size || visited[next] || labels[next] < 0 || !family[labels[next]]) continue;
                    visited[next] = 1;
                    queue.push(next);
                }
            }
            largestRegion = Math.max(largestRegion, queue.length);
        }
        // Area leads; edge coverage helps backgrounds, but cannot let a thin frame dominate.
        const score = (0.48 * population + 0.2 * largestRegion) / samples.length
            + 0.32 * edgePopulation / Math.max(1, edgeCount);
        if (score > bestScore) {
            bestScore = score;
            selected = family;
        }
    }
    const members = palette.flatMap((color, index) => selected[index]
        ? [{ color, weight: populations[index] + 2 * edges[index] }]
        : []).sort((first, second) => first.color.lightness - second.color.lightness);
    const totalWeight = members.reduce((sum, member) => sum + member.weight, 0);
    const chroma = members.reduce((sum, member) => sum + Math.hypot(member.color.a, member.color.b) * member.weight, 0) / totalWeight;
    // Lift colored shadows, but do not turn an already bright sky into a pastel highlight.
    const meanLightness = members.reduce((sum, member) => sum + member.color.lightness * member.weight, 0) / totalWeight;
    const liftShadows = chroma > 0.04 && meanLightness < 0.72;
    const lower = totalWeight * (liftShadows ? 0.45 : 0.15);
    const upper = totalWeight * (liftShadows ? 0.9 : 0.85);
    const result: Oklab = { lightness: 0, a: 0, b: 0 };
    let position = 0;
    let total = 0;
    for (const member of members) {
        const weight = Math.max(0, Math.min(position + member.weight, upper) - Math.max(position, lower));
        position += member.weight;
        result.lightness += member.color.lightness * weight;
        result.a += member.color.a * weight;
        result.b += member.color.b * weight;
        total += weight;
    }
    return fromOklab({ lightness: result.lightness / total, a: result.a / total, b: result.b / total });
}

function computeGlassColor(argb: number, isDark: boolean): string {
    const r = (argb >>> 16) & 0xff;
    const g = (argb >>> 8) & 0xff;
    const b = argb & 0xff;
    const s = 2.2;
    const sr = Math.min(255, Math.max(0, (0.2126 + 0.7874 * s) * r + (0.7152 - 0.7152 * s) * g + (0.0722 - 0.0722 * s) * b));
    const sg = Math.min(255, Math.max(0, (0.2126 - 0.2126 * s) * r + (0.7152 + 0.2848 * s) * g + (0.0722 - 0.0722 * s) * b));
    const sb = Math.min(255, Math.max(0, (0.2126 - 0.2126 * s) * r + (0.7152 - 0.7152 * s) * g + (0.0722 + 0.9278 * s) * b));
    const [or, og, ob, a] = isDark ? [38, 38, 40, 0.6] : [245, 245, 247, 0.55];
    const out = (0xff000000
        | (Math.round(or * a + sr * (1 - a)) << 16)
        | (Math.round(og * a + sg * (1 - a)) << 8)
        | Math.round(ob * a + sb * (1 - a))) >>> 0;
    return hexFromArgb(out);
}

/** Approximate the observed material without forcing every cover into a pastel palette. */
export function createArtworkTheme(color: number, systemDark: boolean): ArtworkTheme {
    const source = toOklab(color);
    const chroma = Math.hypot(source.a, source.b);
    let lightness = source.lightness;
    if (systemDark) lightness = Math.max(0.18, Math.min(0.4, lightness * 0.45));
    else if (lightness < 0.18) lightness = 0.18;
    else if ((lightness >= 0.56 && lightness < 0.75) || (lightness >= 0.75 && chroma > 0.14)) lightness -= 0.06;
    // Strong colors lose some chroma with lightness; avoid turning red/yellow into clipped neon.
    const chromaScale = !systemDark && chroma > 0.14 && lightness < source.lightness
        ? (lightness / source.lightness) ** 2 : 1;
    const background = fromOklab({ lightness, a: source.a * chromaScale, b: source.b * chromaScale });
    const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * linear((background >>> 16) & 255)
        + 0.7152 * linear((background >>> 8) & 255) + 0.0722 * linear(background & 255);
    const isDark = luminance < 0.32;
    return {
        background: hexFromArgb(background),
        sidebarBackground: computeGlassColor(background, isDark),
        isDark,
    };
}
