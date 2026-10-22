import { Hct, QuantizerWu, hexFromArgb } from '@material/material-color-utilities';

export interface ArtworkTheme {
    background: string;
    sidebarBackground: string;
    isDark: boolean;
}

/** Choose a populated color family rather than averaging unrelated cover colors into gray. */
export function selectArtworkColor(pixels: Uint8ClampedArray): number | null {
    const samples: number[] = [];
    for (let i = 0; i < pixels.length; i += 4) {
        // Transparent margins must not compete with the actual artwork.
        if (pixels[i + 3] < 128) continue;
        samples.push((0xff000000 | (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]) >>> 0);
    }
    if (samples.length === 0) return null;

    // Wu quantization is deterministic, keeping the same cover stable across reloads.
    const palette = new QuantizerWu().quantize(samples, 8);
    const populations = palette.map(() => 0);
    for (const sample of samples) {
        let nearest = 0;
        let distance = Infinity;
        palette.forEach((color, index) => {
            const dr = ((sample >>> 16) & 255) - ((color >>> 16) & 255);
            const dg = ((sample >>> 8) & 255) - ((color >>> 8) & 255);
            const db = (sample & 255) - (color & 255);
            const next = dr * dr + dg * dg + db * db;
            if (next < distance) {
                nearest = index;
                distance = next;
            }
        });
        populations[nearest]++;
    }
    let selected = palette[0];
    let bestScore = -1;
    palette.forEach((color, index) => {
        // A broad colored region can outweigh skin tones, without letting tiny accents win.
        const score = populations[index] * (1 + Math.min(Hct.fromInt(color).chroma, 48) / 12);
        if (score > bestScore) {
            selected = color;
            bestScore = score;
        }
    });
    return selected >>> 0;
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

/** Approximate the observed album material; these are not Apple's private tuning values. */
export function createArtworkTheme(color: number, systemDark: boolean): ArtworkTheme {
    const source = Hct.fromInt(color);
    const isPale = source.chroma < 20 && source.tone > 70;
    const tone = isPale
        ? (systemDark ? 26 : 96)
        : systemDark
            ? Math.max(20, Math.min(46, source.tone * 0.72))
            : Math.max(20, Math.min(65, source.tone - 8));
    const background = Hct.from(source.hue, Math.min(source.chroma, isPale ? 6 : 52), tone);
    return {
        background: hexFromArgb(background.toInt()),
        sidebarBackground: computeGlassColor(background.toInt(), tone < 70),
        isDark: tone < 70,
    };
}
