import { Hct, hexFromArgb } from '@material/material-color-utilities';

export interface ArtworkTheme {
    background: string;
    sidebarBackground: string;
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
    const isDark = systemDark || source.tone < 55;
    const tone = systemDark
        ? Math.max(16, Math.min(26, source.tone * 0.32))
        : isDark
            ? Math.max(24, Math.min(42, source.tone))
            : Math.max(72, Math.min(84, source.tone));
    const background = Hct.from(source.hue, Math.min(source.chroma, systemDark ? 32 : 48), tone);
    const bgInt = background.toInt();
    return {
        background: hexFromArgb(bgInt),
        sidebarBackground: computeGlassColor(bgInt, isDark),
        isDark,
    };
}
