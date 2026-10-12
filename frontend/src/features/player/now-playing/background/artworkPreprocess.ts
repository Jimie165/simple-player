const MAX_SATURATION_BOOST = 3;
const MIN_SATURATION_BOOST = 1.4;
const MAX_PIXEL_SATURATION = 0.78;
const SATURATION_KNEE = 0.55;
const HIGHLIGHT_KNEE = 180;
const HIGHLIGHT_LIMIT = 224;

const clamp = (value: number, minimum: number, maximum: number) =>
    Math.min(maximum, Math.max(minimum, value));

function getAdaptiveSaturation(pixels: Uint8ClampedArray) {
    const saturationSamples: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const saturation = maximum > 0 ? (maximum - minimum) / maximum : 0;
        saturationSamples.push(saturation * Math.sqrt(maximum / 255));
    }
    saturationSamples.sort((left, right) => left - right);
    const vividStart = Math.floor(saturationSamples.length * 0.75);
    let vividTotal = 0;
    for (let index = vividStart; index < saturationSamples.length; index += 1) {
        vividTotal += saturationSamples[index];
    }
    const vividness = vividTotal / Math.max(1, saturationSamples.length - vividStart);
    const normalized = clamp((vividness - 0.45) / 0.4, 0, 1);
    const eased = normalized * normalized * (3 - 2 * normalized);
    return MAX_SATURATION_BOOST
        - (MAX_SATURATION_BOOST - MIN_SATURATION_BOOST) * eased;
}

export const ARTWORK_TEXTURE_SIZE = 128;

export function preprocessArtwork(source: CanvasImageSource) {
    const canvas = document.createElement('canvas');
    canvas.width = ARTWORK_TEXTURE_SIZE;
    canvas.height = ARTWORK_TEXTURE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('无法创建封面预处理画布');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const saturation = getAdaptiveSaturation(pixels);
    for (let index = 0; index < pixels.length; index += 4) {
        let red = (pixels[index] - 128) * 0.4 + 128;
        let green = (pixels[index + 1] - 128) * 0.4 + 128;
        let blue = (pixels[index + 2] - 128) * 0.4 + 128;
        const gray = red * 0.3 + green * 0.59 + blue * 0.11;
        red = gray * (1 - saturation) + red * saturation;
        green = gray * (1 - saturation) + green * saturation;
        blue = gray * (1 - saturation) + blue * saturation;
        // 对比度和亮度先在浮点空间完成，避免提前截断亮色层次。
        red = ((red - 128) * 1.7 + 128) * 0.75;
        green = ((green - 128) * 1.7 + 128) * 0.75;
        blue = ((blue - 128) * 1.7 + 128) * 0.75;

        const luminance = red * 0.3 + green * 0.59 + blue * 0.11;
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const pixelSaturation = maximum > 0 ? (maximum - minimum) / maximum : 0;
        if (pixelSaturation > SATURATION_KNEE) {
            const highlight = clamp((luminance / 255 - 0.45) / 0.25, 0, 1);
            const highlightWeight = highlight * highlight * (3 - 2 * highlight);
            const saturationLimit = MAX_PIXEL_SATURATION - 0.12 * highlightWeight;
            const shoulder = saturationLimit - SATURATION_KNEE;
            const protectedSaturation = SATURATION_KNEE + shoulder * (
                1 - Math.exp(-(pixelSaturation - SATURATION_KNEE) / shoulder)
            );
            // 围绕亮度缩小色差，不再通过抬高弱通道把鲜艳颜色洗白。
            const chromaScale = protectedSaturation * luminance / (
                maximum - minimum - protectedSaturation * (maximum - luminance)
            );
            red = luminance + (red - luminance) * chromaScale;
            green = luminance + (green - luminance) * chromaScale;
            blue = luminance + (blue - luminance) * chromaScale;
        }

        const peak = Math.max(red, green, blue);
        if (peak > HIGHLIGHT_KNEE) {
            const shoulder = HIGHLIGHT_LIMIT - HIGHLIGHT_KNEE;
            const protectedPeak = HIGHLIGHT_KNEE + shoulder * (
                1 - Math.exp(-(peak - HIGHLIGHT_KNEE) / shoulder)
            );
            const exposure = protectedPeak / peak;
            red *= exposure;
            green *= exposure;
            blue *= exposure;
        }

        pixels[index] = red;
        pixels[index + 1] = green;
        pixels[index + 2] = blue;
    }
    // Keep material structure until the moving layers have been composited.
    return imageData;
}
