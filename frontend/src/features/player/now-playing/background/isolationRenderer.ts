type Rgb = readonly [number, number, number];

const RENDER_SCALE = 0.5;
const FRAME_INTERVAL_MS = 1000 / 30;
const FLOW_SPEED = 0.8;
const PALETTE_TRANSITION_MS = 1000;
const COLOR_COUNT = 4;

const DEFAULT_COLORS: readonly Rgb[] = [
    [0.09, 0.09, 0.11],
    [0.13, 0.13, 0.16],
    [0.07, 0.07, 0.09],
    [0.11, 0.11, 0.13],
];

const VERTEX_SHADER = `
attribute vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_colors[4];
uniform vec3 u_random;
uniform vec4 u_flowParams;
uniform float u_angleJitter;

const float PI = 3.141592653589793;

vec2 rotatePoint(vec2 point, float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return vec2(
        point.x * cosine - point.y * sine,
        point.x * sine + point.y * cosine
    );
}

vec2 gradientHash(vec2 point) {
    return fract(
        sin(
            vec2(
                dot(point, vec2(127.1, 311.7)),
                dot(point, vec2(269.5, 183.3))
            )
        ) * 43758.5453
    );
}

float gradientNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 offset = fract(point);
    vec2 eased = offset * offset * (3.0 - 2.0 * offset);
    float lower = mix(
        dot(-1.0 + 2.0 * gradientHash(cell), offset),
        dot(-1.0 + 2.0 * gradientHash(cell + vec2(1.0, 0.0)), offset - vec2(1.0, 0.0)),
        eased.x
    );
    float upper = mix(
        dot(-1.0 + 2.0 * gradientHash(cell + vec2(0.0, 1.0)), offset - vec2(0.0, 1.0)),
        dot(-1.0 + 2.0 * gradientHash(cell + vec2(1.0, 1.0)), offset - vec2(1.0, 1.0)),
        eased.x
    );
    return 0.5 + 0.5 * mix(lower, upper, eased.y);
}

float encodeSrgb(float channel) {
    return channel <= 0.0031308
        ? 12.92 * channel
        : 1.055 * pow(max(channel, 0.0), 1.0 / 2.4) - 0.055;
}

vec3 okLabToSrgb(vec3 color) {
    float lRoot = color.x + 0.3963377774 * color.y + 0.2158037573 * color.z;
    float mRoot = color.x - 0.1055613458 * color.y - 0.0638541728 * color.z;
    float sRoot = color.x - 0.0894841775 * color.y - 1.2914855480 * color.z;
    float l = lRoot * lRoot * lRoot;
    float m = mRoot * mRoot * mRoot;
    float s = sRoot * sRoot * sRoot;
    vec3 linearColor = vec3(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
    return vec3(
        encodeSrgb(linearColor.r),
        encodeSrgb(linearColor.g),
        encodeSrgb(linearColor.b)
    );
}

float interleavedGradientNoise(vec2 position) {
    return fract(52.9829189 * fract(dot(position, vec2(0.06711056, 0.00583715))));
}

vec3 screenSpaceDither(vec2 screenPosition) {
    vec2 position = screenPosition + u_random.xy * 97.0;
    vec3 noise = vec3(
        interleavedGradientNoise(position),
        interleavedGradientNoise(position + vec2(17.0, 59.0)),
        interleavedGradientNoise(position + vec2(71.0, 23.0))
    );
    return (noise - 0.5) / 255.0;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 gradientPoint = uv - 0.5;
    float degree = gradientNoise(
        vec2(
            // 保留噪声驱动的自然往复，但放慢大范围转向，避免短时间内频繁反转。
            u_time * 0.03 + u_random.x * 0.07,
            gradientPoint.x * gradientPoint.y + u_random.y * 0.07
        )
    );
    float noiseAngle = ((degree - 0.5) * 720.0 + 180.0) * PI / 180.0;
    gradientPoint = rotatePoint(gradientPoint, noiseAngle + u_angleJitter);

    float frequency = u_flowParams.x;
    float amplitude = u_flowParams.y;
    float speed = u_time * u_flowParams.z;
    gradientPoint.x += sin(gradientPoint.y * frequency + speed) / amplitude;
    gradientPoint.y +=
        sin(gradientPoint.x * frequency * 1.5 + speed) / (amplitude * 0.5);

    float rotatedX = rotatePoint(gradientPoint, u_flowParams.w).x;
    float horizontal = smoothstep(-0.3, 0.2, rotatedX);
    vec3 okLabColor = mix(
        mix(u_colors[0], u_colors[1], horizontal),
        mix(u_colors[2], u_colors[3], horizontal),
        1.0 - smoothstep(-0.3, 0.5, gradientPoint.y)
    );
    // 在 OkLab 中仅压缩明度：L <= 0.6 不变，L = 1 平滑映射到 0.83。
    // 二次曲线保持明度单调递增和起点斜率连续，避免高光层次反转或硬截断。
    float highlightProgress = clamp((okLabColor.x - 0.6) / 0.4, 0.0, 1.0);
    okLabColor.x -= 0.17 * highlightProgress * highlightProgress;
    vec3 color = okLabToSrgb(okLabColor);

    // 与网格渐变保持相同的亮度自适应暗角：亮色边缘最多额外压暗 40%。
    float brightness = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float highlightWeight = smoothstep(0.18, 0.65, brightness);
    float edgeWeight = smoothstep(0.3, 0.8, distance(uv, vec2(0.5)));
    color *= 1.0 - 0.4 * edgeWeight * highlightWeight;

    color += screenSpaceDither(gl_FragCoord.xy);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

interface ProgramInfo {
    program: WebGLProgram;
    position: number;
    resolution: WebGLUniformLocation;
    time: WebGLUniformLocation;
    colors: WebGLUniformLocation;
    random: WebGLUniformLocation;
    flowParams: WebGLUniformLocation;
    angleJitter: WebGLUniformLocation;
}

interface PaletteSample {
    color: Rgb;
    count: number;
}

const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

function channelToLinear(value: number) {
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function srgbToOkLab([red, green, blue]: Rgb): Rgb {
    const linearRed = channelToLinear(red);
    const linearGreen = channelToLinear(green);
    const linearBlue = channelToLinear(blue);
    const l = Math.cbrt(0.4122214708 * linearRed + 0.5363325363 * linearGreen + 0.0514459929 * linearBlue);
    const m = Math.cbrt(0.2119034982 * linearRed + 0.6806995451 * linearGreen + 0.1073969566 * linearBlue);
    const s = Math.cbrt(0.0883024619 * linearRed + 0.2817188376 * linearGreen + 0.6299787005 * linearBlue);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

function colorDistance(left: Rgb, right: Rgb) {
    const red = left[0] - right[0];
    const green = left[1] - right[1];
    const blue = left[2] - right[2];
    return red * red + green * green + blue * blue;
}

function createHistogram(imageData: ImageData): PaletteSample[] {
    const counts = new Map<number, number>();
    const pixels = imageData.data;
    for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] < 32) continue;
        const red = pixels[index] >> 3;
        const green = pixels[index + 1] >> 3;
        const blue = pixels[index + 2] >> 3;
        const key = (red << 10) | (green << 5) | blue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts, ([key, count]) => ({
        color: [
            (((key >> 10) & 31) * 8 + 4) / 255,
            (((key >> 5) & 31) * 8 + 4) / 255,
            ((key & 31) * 8 + 4) / 255,
        ],
        count,
    }));
}

export function extractIsolationPalette(imageData: ImageData): Rgb[] {
    const samples = createHistogram(imageData);
    if (samples.length === 0) return [...DEFAULT_COLORS];

    const centers: Rgb[] = [];
    const dominant = samples.reduce((best, sample) => sample.count > best.count ? sample : best);
    centers.push(dominant.color);
    while (centers.length < COLOR_COUNT) {
        let best = samples[0];
        let bestScore = -1;
        for (const sample of samples) {
            const nearest = Math.min(...centers.map((center) => colorDistance(sample.color, center)));
            const score = nearest * Math.sqrt(sample.count);
            if (score > bestScore) {
                best = sample;
                bestScore = score;
            }
        }
        centers.push(best.color);
    }

    for (let iteration = 0; iteration < 8; iteration += 1) {
        const totals = Array.from({ length: COLOR_COUNT }, () => [0, 0, 0, 0]);
        for (const sample of samples) {
            let nearestIndex = 0;
            let nearestDistance = Number.POSITIVE_INFINITY;
            for (let index = 0; index < centers.length; index += 1) {
                const distance = colorDistance(sample.color, centers[index]);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIndex = index;
                }
            }
            const total = totals[nearestIndex];
            total[0] += sample.color[0] * sample.count;
            total[1] += sample.color[1] * sample.count;
            total[2] += sample.color[2] * sample.count;
            total[3] += sample.count;
        }
        for (let index = 0; index < centers.length; index += 1) {
            const total = totals[index];
            if (total[3] > 0) centers[index] = [
                total[0] / total[3],
                total[1] / total[3],
                total[2] / total[3],
            ];
        }
    }

    return centers;
}

function createProgram(gl: WebGLRenderingContext): ProgramInfo {
    const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('无法创建 Isolation 背景着色器');
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Isolation 背景着色器编译失败：${message ?? '未知错误'}`);
        }
        return shader;
    };

    const vertexShader = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error('无法创建 Isolation 背景程序');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Isolation 背景程序链接失败：${message ?? '未知错误'}`);
    }

    const uniform = (name: string) => {
        const location = gl.getUniformLocation(program, name);
        if (!location) {
            gl.deleteProgram(program);
            throw new Error(`Isolation 背景缺少 uniform：${name}`);
        }
        return location;
    };
    return {
        program,
        position: gl.getAttribLocation(program, 'a_position'),
        resolution: uniform('u_resolution'),
        time: uniform('u_time'),
        colors: uniform('u_colors[0]'),
        random: uniform('u_random'),
        flowParams: uniform('u_flowParams'),
        angleJitter: uniform('u_angleJitter'),
    };
}

function createSeed(pixels: Uint8ClampedArray) {
    let seed = 2166136261;
    for (let index = 0; index < pixels.length; index += 16) {
        seed ^= pixels[index] | (pixels[index + 1] << 8) | (pixels[index + 2] << 16);
        seed = Math.imul(seed, 16777619);
    }
    return seed >>> 0;
}

function createRandom(seed: number) {
    let state = seed;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    };
}

const DEFAULT_OKLAB_COLORS = new Float32Array(DEFAULT_COLORS.flatMap(srgbToOkLab));

export class IsolationRenderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly gl: WebGLRenderingContext;
    private readonly program: ProgramInfo;
    private readonly quadBuffer: WebGLBuffer;
    private readonly fromColors = new Float32Array(DEFAULT_OKLAB_COLORS);
    private readonly toColors = new Float32Array(DEFAULT_OKLAB_COLORS);
    private readonly colors = new Float32Array(DEFAULT_OKLAB_COLORS);
    private readonly randomValues = new Float32Array(3);
    private readonly flowParams = new Float32Array(4);
    private angleJitter = 0;
    private animationFrame = 0;
    private lastFrame = 0;
    private elapsedTime = 0;
    private paletteTransitionElapsed = PALETTE_TRANSITION_MS;
    private artworkRequest = 0;
    private active = true;
    private visible = !document.hidden;
    private disposed = false;
    private resizeTimer: number | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            powerPreference: 'low-power',
        });
        if (!gl) throw new Error('当前环境不支持 Isolation WebGL 背景');
        this.gl = gl;
        this.program = createProgram(gl);
        const quadBuffer = gl.createBuffer();
        if (!quadBuffer) {
            gl.deleteProgram(this.program.program);
            throw new Error('无法创建 Isolation 背景缓冲区');
        }
        this.quadBuffer = quadBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        gl.useProgram(this.program.program);
        gl.enableVertexAttribArray(this.program.position);
        gl.vertexAttribPointer(this.program.position, 2, gl.FLOAT, false, 0, 0);
        this.rollFlowParameters(createRandom(0x516f4a3d));
        this.resizeNow();
        this.requestFrame();
    }

    private rollFlowParameters(random: () => number) {
        const tau = Math.PI * 2;
        for (let index = 0; index < this.randomValues.length; index += 1) {
            this.randomValues[index] = random() * tau;
        }
        const direction = random() < 0.5 ? -1 : 1;
        this.flowParams[0] = mix(4.5, 5.5, random());
        this.flowParams[1] = mix(22, 29, random());
        this.flowParams[2] = mix(0.65, 0.85, random()) * direction;
        this.flowParams[3] = (-5 + (random() - 0.5) * 12) * Math.PI / 180;
        this.angleJitter = (random() - 0.5) * 0.3;
    }

    resize() {
        if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => {
            this.resizeTimer = null;
            this.resizeNow();
        }, 120);
    }

    private resizeNow() {
        if (this.disposed) return;
        const pixelScale = window.devicePixelRatio * RENDER_SCALE;
        const width = Math.max(2, Math.ceil(this.canvas.clientWidth * pixelScale));
        const height = Math.max(2, Math.ceil(this.canvas.clientHeight * pixelScale));
        if (this.canvas.width === width && this.canvas.height === height) return;
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
        this.renderFrame();
        this.canvas.style.visibility = 'visible';
        this.requestFrame();
    }

    private updateColors(elapsed: number) {
        this.paletteTransitionElapsed = Math.min(
            PALETTE_TRANSITION_MS,
            this.paletteTransitionElapsed + elapsed,
        );
        const progress = this.paletteTransitionElapsed / PALETTE_TRANSITION_MS;
        const eased = progress * progress * (3 - 2 * progress);
        for (let index = 0; index < this.colors.length; index += 1) {
            this.colors[index] = mix(this.fromColors[index], this.toColors[index], eased);
        }
    }

    private renderFrame() {
        const gl = this.gl;
        gl.useProgram(this.program.program);
        gl.uniform2f(this.program.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.program.time, this.elapsedTime / 1000);
        gl.uniform3fv(this.program.colors, this.colors);
        gl.uniform3fv(this.program.random, this.randomValues);
        gl.uniform4fv(this.program.flowParams, this.flowParams);
        gl.uniform1f(this.program.angleJitter, this.angleJitter);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    private draw = (time: number) => {
        this.animationFrame = 0;
        if (!this.active || !this.visible || this.disposed) return;
        const elapsed = time - this.lastFrame;
        if (elapsed < FRAME_INTERVAL_MS) {
            this.requestFrame();
            return;
        }
        const frameElapsed = Math.min(elapsed, 250);
        this.lastFrame = time - elapsed % FRAME_INTERVAL_MS;
        this.elapsedTime += frameElapsed * FLOW_SPEED;
        this.updateColors(frameElapsed);
        this.renderFrame();
        this.canvas.style.visibility = 'visible';
        this.requestFrame();
    };

    private requestFrame() {
        if (!this.animationFrame && this.active && this.visible && !this.disposed) {
            this.animationFrame = requestAnimationFrame(this.draw);
        }
    }

    private cancelFrame() {
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        this.animationFrame = 0;
    }

    setActive(active: boolean) {
        this.active = active;
        if (active) {
            this.lastFrame = performance.now();
            this.requestFrame();
        } else {
            this.cancelFrame();
        }
    }

    setVisible(visible: boolean) {
        this.visible = visible;
        if (visible) {
            this.lastFrame = performance.now();
            this.requestFrame();
        } else {
            this.cancelFrame();
        }
    }

    private transitionToPalette(palette: readonly Rgb[], seed: number) {
        this.updateColors(0);
        this.fromColors.set(this.colors);
        for (let index = 0; index < COLOR_COUNT; index += 1) {
            this.toColors.set(srgbToOkLab(palette[index]), index * 3);
        }
        this.paletteTransitionElapsed = 0;
        this.rollFlowParameters(createRandom(seed));
        this.requestFrame();
    }

    private readImageData(source: CanvasImageSource) {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('无法创建 Isolation 封面取色画布');
        context.drawImage(source, 0, 0, 32, 32);
        return context.getImageData(0, 0, 32, 32);
    }

    async setArtwork(src: string) {
        const request = ++this.artworkRequest;
        let imageData: ImageData;
        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`封面读取失败：${response.status}`);
            const bitmap = await createImageBitmap(await response.blob(), {
                resizeWidth: 32,
                resizeHeight: 32,
                resizeQuality: 'low',
            });
            if (this.disposed || request !== this.artworkRequest) {
                bitmap.close();
                return;
            }
            try {
                imageData = this.readImageData(bitmap);
            } finally {
                bitmap.close();
            }
        } catch (error) {
            try {
                const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const element = new Image();
                    element.crossOrigin = 'anonymous';
                    element.onload = () => resolve(element);
                    element.onerror = () => reject(new Error('封面图片解码失败'));
                    element.src = src;
                });
                if (this.disposed || request !== this.artworkRequest) return;
                imageData = this.readImageData(image);
            } catch (fallbackError) {
                if (request !== this.artworkRequest) return;
                console.error('Isolation 背景封面加载失败', error, fallbackError);
                return;
            }
        }
        if (this.disposed || request !== this.artworkRequest) return;
        this.transitionToPalette(extractIsolationPalette(imageData), createSeed(imageData.data));
    }

    dispose() {
        this.disposed = true;
        this.artworkRequest += 1;
        this.cancelFrame();
        if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
        this.gl.deleteBuffer(this.quadBuffer);
        this.gl.deleteProgram(this.program.program);
        // React StrictMode 会在不移除 canvas 的情况下重放 effect。这里不能主动
        // loseContext，否则紧接着创建的新 renderer 会拿到已丢失的同一个上下文，
        // WebView 只能显示带哭脸的失效 canvas。
    }
}
