import { Hct, hexFromArgb } from '@material/material-color-utilities';

export interface ArtworkTheme {
    background: string;
    isDark: boolean;
}

/** Alpha-weighted thumbnail sampling keeps transparent artwork from turning black. */
export function averageArtworkColor(pixels: Uint8ClampedArray): number | null {
    let red = 0;
    let green = 0;
    let blue = 0;
    let weight = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3] / 255;
        red += pixels[i] * alpha;
        green += pixels[i + 1] * alpha;
        blue += pixels[i + 2] * alpha;
        weight += alpha;
    }
    if (weight === 0) return null;
    return (0xff000000 | (Math.round(red / weight) << 16)
        | (Math.round(green / weight) << 8) | Math.round(blue / weight)) >>> 0;
}

/** Approximate the observed album material; these are not Apple's private tuning values. */
export function createArtworkTheme(color: number, systemDark: boolean): ArtworkTheme {
    const source = Hct.fromInt(color);
    const isDark = systemDark || source.tone < 55;
    const tone = systemDark
        ? Math.max(16, Math.min(26, source.tone * 0.32))
        : isDark
            ? Math.max(24, Math.min(42, source.tone))
            : Math.max(72, Math.min(84, source.tone));
    const background = Hct.from(source.hue, Math.min(source.chroma, systemDark ? 32 : 48), tone);
    return { background: hexFromArgb(background.toInt()), isDark };
}
