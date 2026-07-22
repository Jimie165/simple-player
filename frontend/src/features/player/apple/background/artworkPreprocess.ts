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
    for (let index = 0; index < pixels.length; index += 4) {
        let red = (pixels[index] - 128) * 0.4 + 128;
        let green = (pixels[index + 1] - 128) * 0.4 + 128;
        let blue = (pixels[index + 2] - 128) * 0.4 + 128;
        const gray = red * 0.3 + green * 0.59 + blue * 0.11;
        red = gray * -2 + red * 3;
        green = gray * -2 + green * 3;
        blue = gray * -2 + blue * 3;
        pixels[index] = ((red - 128) * 1.7 + 128) * 0.75;
        pixels[index + 1] = ((green - 128) * 1.7 + 128) * 0.75;
        pixels[index + 2] = ((blue - 128) * 1.7 + 128) * 0.75;
    }
    blurImageData(imageData);
    return imageData;
}
