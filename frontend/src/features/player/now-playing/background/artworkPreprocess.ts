const MAX_SATURATION_BOOST = 3;
const MIN_SATURATION_BOOST = 1.4;
const MAX_PIXEL_SATURATION = 0.78;

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

function blurImageData(imageData: ImageData, radius = 2, quality = 4) {
    const { width, height, data } = imageData;
    const temporary = new Uint8ClampedArray(data.length);
    for (let pass = 0; pass < quality; pass += 1) {
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const output = (y * width + x) * 4;
                for (let channel = 0; channel < 4; channel += 1) {
                    let total = 0;
                    for (let offset = -radius; offset <= radius; offset += 1) {
                        const sampleX = Math.min(width - 1, Math.max(0, x + offset));
                        total += data[(y * width + sampleX) * 4 + channel];
                    }
                    temporary[output + channel] = total / (radius * 2 + 1);
                }
            }
        }
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const output = (y * width + x) * 4;
                for (let channel = 0; channel < 4; channel += 1) {
                    let total = 0;
                    for (let offset = -radius; offset <= radius; offset += 1) {
                        const sampleY = Math.min(height - 1, Math.max(0, y + offset));
                        total += temporary[(sampleY * width + x) * 4 + channel];
                    }
                    data[output + channel] = total / (radius * 2 + 1);
                }
            }
        }
    }
}

export function preprocessArtwork(source: CanvasImageSource) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('无法创建封面预处理画布');
    context.drawImage(source, 0, 0, 32, 32);
    const imageData = context.getImageData(0, 0, 32, 32);
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
        red = clamp((red - 128) * 1.7 + 128, 0, 255);
        green = clamp((green - 128) * 1.7 + 128, 0, 255);
        blue = clamp((blue - 128) * 1.7 + 128, 0, 255);

        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const pixelSaturation = maximum > 0 ? (maximum - minimum) / maximum : 0;
        if (pixelSaturation > MAX_PIXEL_SATURATION) {
            const chromaScale = MAX_PIXEL_SATURATION / pixelSaturation;
            red = maximum - (maximum - red) * chromaScale;
            green = maximum - (maximum - green) * chromaScale;
            blue = maximum - (maximum - blue) * chromaScale;
        }

        pixels[index] = red * 0.75;
        pixels[index + 1] = green * 0.75;
        pixels[index + 2] = blue * 0.75;
    }
    blurImageData(imageData);
    return imageData;
}
