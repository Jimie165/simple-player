const SATURATION_BOOST = 3;
const HIGHLIGHT_KNEE = 180;
const HIGHLIGHT_LIMIT = 224;

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
    for (let index = 0; index < pixels.length; index += 4) {
        let red = (pixels[index] - 128) * 0.4 + 128;
        let green = (pixels[index + 1] - 128) * 0.4 + 128;
        let blue = (pixels[index + 2] - 128) * 0.4 + 128;
        const gray = red * 0.3 + green * 0.59 + blue * 0.11;
        red = gray * (1 - SATURATION_BOOST) + red * SATURATION_BOOST;
        green = gray * (1 - SATURATION_BOOST) + green * SATURATION_BOOST;
        blue = gray * (1 - SATURATION_BOOST) + blue * SATURATION_BOOST;
        // 对比度和亮度先在浮点空间完成，避免提前截断亮色层次。
        red = ((red - 128) * 1.7 + 128) * 0.75;
        green = ((green - 128) * 1.7 + 128) * 0.75;
        blue = ((blue - 128) * 1.7 + 128) * 0.75;

        // 只对增强后的高峰值统一压缩曝光，保留普通彩色区域的色差。
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
