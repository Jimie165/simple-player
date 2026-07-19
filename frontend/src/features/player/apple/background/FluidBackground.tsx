import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { LowFrequencyFrame } from '@/features/player/apple/hooks/useLowFrequencyLevel';

const MESH_VERTEX_SHADER = `
precision highp float;
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
uniform float u_aspect;
void main() {
    v_uv = a_uv;
    vec2 position = a_position;
    if (u_aspect > 1.0) {
        position.y *= u_aspect;
    } else {
        position.x /= u_aspect;
    }
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

const MESH_FRAGMENT_SHADER = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_volume;

const float INV_255 = 1.0 / 255.0;
const float HALF_INV_255 = 0.5 / 255.0;

float gradientNoise(vec2 coordinate) {
    return fract(52.9829189 * fract(dot(coordinate, vec2(0.06711056, 0.00583715))));
}

vec2 rotate2d(vec2 value, float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return vec2(cosine * value.x - sine * value.y, sine * value.x + cosine * value.y);
}

void main() {
    float volume = clamp(u_volume, 0.0, 1.0);
    vec2 centeredUV = v_uv - vec2(0.2);
    vec2 rotatedUV = rotate2d(centeredUV, u_time * 2.0);
    // 低频只推动围绕画面中心的纹理呼吸，不改变底层流动的时间轴。
    vec2 finalUV = rotatedUV * (1.0 - volume * 0.160) + vec2(0.5);
    vec3 color = texture2D(u_texture, finalUV).rgb;

    float dither = INV_255 * gradientNoise(gl_FragCoord.xy) - HALF_INV_255;
    color += vec3(dither);

    float distanceFromCenter = distance(v_uv, vec2(0.5));
    float vignette = smoothstep(0.82, 0.28, distanceFromCenter);
    color *= 0.82 + vignette * 0.18;
    gl_FragColor = vec4(color, 1.0);
}
`;

const QUAD_VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_uv = a_position * 0.5 + 0.5;
}
`;

const PRESENT_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
void main() {
    gl_FragColor = texture2D(u_texture, v_uv);
}
`;

function applySoftThreshold(value: number, threshold: number) {
    const normalized = Math.min(1, Math.max(0, (value - threshold) / (1 - threshold)));
    return normalized * normalized * (3 - 2 * normalized);
}

interface ProgramInfo {
    program: WebGLProgram;
    attributes: Record<string, number>;
    uniforms: Record<string, WebGLUniformLocation | null>;
}

interface RenderTarget {
    framebuffer: WebGLFramebuffer;
    texture: WebGLTexture;
}

function compileProgram(
    gl: WebGLRenderingContext,
    vertexSource: string,
    fragmentSource: string,
    attributeNames: string[],
    uniformNames: string[],
): ProgramInfo {
    const compileShader = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('无法创建背景着色器');
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`背景着色器编译失败：${message ?? '未知错误'}`);
        }
        return shader;
    };

    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error('无法创建背景渲染程序');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`背景渲染程序链接失败：${message ?? '未知错误'}`);
    }
    return {
        program,
        attributes: Object.fromEntries(attributeNames.map((name) => [name, gl.getAttribLocation(program, name)])),
        uniforms: Object.fromEntries(uniformNames.map((name) => [name, gl.getUniformLocation(program, name)])),
    };
}

function createMesh(seed: number, columns = 33, rows = 33) {
    const vertices = new Float32Array(columns * rows * 4);
    const indices = new Uint16Array((columns - 1) * (rows - 1) * 6);
    let vertexOffset = 0;
    for (let row = 0; row < rows; row += 1) {
        const v = row / (rows - 1);
        for (let column = 0; column < columns; column += 1) {
            const u = column / (columns - 1);
            const interior = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
            const warpX = (
                Math.sin(v * Math.PI * 2 + seed) * 0.105
                + Math.sin(v * Math.PI * 4 - seed * 0.7) * 0.04
            ) * interior;
            const warpY = (
                Math.sin(u * Math.PI * 2 - seed * 0.8) * 0.11
                + Math.sin(u * Math.PI * 4 + seed * 0.55) * 0.035
            ) * interior;
            vertices[vertexOffset] = u * 2 - 1 + warpX;
            vertices[vertexOffset + 1] = v * 2 - 1 + warpY;
            vertices[vertexOffset + 2] = u;
            vertices[vertexOffset + 3] = v;
            vertexOffset += 4;
        }
    }

    let indexOffset = 0;
    for (let row = 0; row < rows - 1; row += 1) {
        for (let column = 0; column < columns - 1; column += 1) {
            const topLeft = row * columns + column;
            const bottomLeft = (row + 1) * columns + column;
            indices[indexOffset] = topLeft;
            indices[indexOffset + 1] = topLeft + 1;
            indices[indexOffset + 2] = bottomLeft;
            indices[indexOffset + 3] = topLeft + 1;
            indices[indexOffset + 4] = bottomLeft + 1;
            indices[indexOffset + 5] = bottomLeft;
            indexOffset += 6;
        }
    }
    return { vertices, indices };
}

function hashSource(source: string) {
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0xffffffff * Math.PI * 2;
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

function preprocessArtwork(source: CanvasImageSource) {
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

class AppleMusicFluidRenderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly lowFrequencyRef?: RefObject<LowFrequencyFrame>;
    private readonly gl: WebGLRenderingContext;
    private readonly meshProgram: ProgramInfo;
    private readonly presentProgram: ProgramInfo;
    private readonly meshVertexBuffer: WebGLBuffer;
    private readonly meshIndexBuffer: WebGLBuffer;
    private readonly quadBuffer: WebGLBuffer;
    private readonly artworkTexture: WebGLTexture;
    private indexCount = 0;
    private target: RenderTarget | null = null;
    private animationFrame = 0;
    private lastFrame = 0;
    private startTime = performance.now();
    private breath = 0;
    private bassBody = 0;
    private beatImpulse = 0;
    private active = true;
    private visible = !document.hidden;
    private disposed = false;
    private resizeTimer: number | null = null;

    constructor(canvas: HTMLCanvasElement, lowFrequencyRef?: RefObject<LowFrequencyFrame>) {
        this.canvas = canvas;
        this.lowFrequencyRef = lowFrequencyRef;
        const gl = canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            powerPreference: 'low-power',
        });
        if (!gl) throw new Error('当前环境不支持 WebGL 背景');
        this.gl = gl;
        this.meshProgram = compileProgram(
            gl,
            MESH_VERTEX_SHADER,
            MESH_FRAGMENT_SHADER,
            ['a_position', 'a_uv'],
            ['u_texture', 'u_time', 'u_volume', 'u_aspect'],
        );
        this.presentProgram = compileProgram(
            gl,
            QUAD_VERTEX_SHADER,
            PRESENT_FRAGMENT_SHADER,
            ['a_position'],
            ['u_texture'],
        );

        const meshVertexBuffer = gl.createBuffer();
        const meshIndexBuffer = gl.createBuffer();
        const quadBuffer = gl.createBuffer();
        const artworkTexture = gl.createTexture();
        if (!meshVertexBuffer || !meshIndexBuffer || !quadBuffer || !artworkTexture) {
            throw new Error('无法创建网格背景缓冲区');
        }
        this.meshVertexBuffer = meshVertexBuffer;
        this.meshIndexBuffer = meshIndexBuffer;
        this.quadBuffer = quadBuffer;
        this.artworkTexture = artworkTexture;

        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        gl.bindTexture(gl.TEXTURE_2D, artworkTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array([76, 82, 88, 255]),
        );
        this.configureArtworkTexture();
        this.updateMesh(0);
        this.resizeNow();
        this.requestFrame();
    }

    private configureArtworkTexture() {
        const gl = this.gl;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    }

    private updateMesh(seed: number) {
        const gl = this.gl;
        const { vertices, indices } = createMesh(seed);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        this.indexCount = indices.length;
    }

    private createTarget(width: number, height: number): RenderTarget {
        const gl = this.gl;
        const texture = gl.createTexture();
        const framebuffer = gl.createFramebuffer();
        if (!texture || !framebuffer) throw new Error('无法创建网格背景离屏缓冲区');
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            gl.deleteTexture(texture);
            gl.deleteFramebuffer(framebuffer);
            throw new Error('网格背景离屏缓冲区不完整');
        }
        return { framebuffer, texture };
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
        const scale = 0.55;
        const width = Math.max(2, Math.round(this.canvas.clientWidth * scale));
        const height = Math.max(2, Math.round(this.canvas.clientHeight * scale));
        if (this.canvas.width === width && this.canvas.height === height && this.target) return;
        let nextTarget: RenderTarget;
        try {
            nextTarget = this.createTarget(width, height);
        } catch (error) {
            console.error('网格背景尺寸更新失败', error);
            return;
        }
        const previous = this.target;
        this.target = nextTarget;
        this.canvas.width = width;
        this.canvas.height = height;
        // 修改 canvas backing store 会立即清空默认 framebuffer。必须在同一任务中
        // 完成新 FBO 的首帧呈现，避免全屏切换时把清空后的黑帧交给合成器。
        const now = performance.now();
        this.renderMesh(now);
        this.present();
        this.canvas.style.visibility = 'visible';
        if (previous) {
            this.gl.deleteFramebuffer(previous.framebuffer);
            this.gl.deleteTexture(previous.texture);
        }
        this.requestFrame();
    }

    private bindTexture(texture: WebGLTexture, uniform: WebGLUniformLocation | null) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(uniform, 0);
    }

    private renderMesh(time: number) {
        if (!this.target) return;
        const gl = this.gl;
        const program = this.meshProgram;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.framebuffer);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(program.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshIndexBuffer);
        gl.enableVertexAttribArray(program.attributes.a_position);
        gl.vertexAttribPointer(program.attributes.a_position, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(program.attributes.a_uv);
        gl.vertexAttribPointer(program.attributes.a_uv, 2, gl.FLOAT, false, 16, 8);
        this.bindTexture(this.artworkTexture, program.uniforms.u_texture);
        gl.uniform1f(program.uniforms.u_time, (time - this.startTime) / 10000);
        gl.uniform1f(program.uniforms.u_volume, this.breath);
        gl.uniform1f(program.uniforms.u_aspect, this.canvas.width / this.canvas.height);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    private present() {
        if (!this.target) return;
        const gl = this.gl;
        const program = this.presentProgram;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(program.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(program.attributes.a_position);
        gl.vertexAttribPointer(program.attributes.a_position, 2, gl.FLOAT, false, 0, 0);
        this.bindTexture(this.target.texture, program.uniforms.u_texture);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    private draw = (time: number) => {
        this.animationFrame = 0;
        if (!this.active || !this.visible || this.disposed || !this.target) return;
        const elapsed = time - this.lastFrame;
        const frameInterval = 1000 / 60;
        if (elapsed < frameInterval) {
            this.requestFrame();
            return;
        }
        this.lastFrame = time - elapsed % frameInterval;
        const frame = this.lowFrequencyRef?.current;
        const targetBass = Math.min(1, Math.max(0, frame?.bass ?? 0));
        const targetBeat = Math.min(1, Math.max(0, frame?.beat ?? 0));
        // 后端保留完整分析结果，视觉层过滤轻微低频和弱 onset，避免底噪或
        // 普通伴奏持续触发呼吸。平滑阈值不会在边界处产生新的跳变。
        const gatedBass = applySoftThreshold(targetBass, 0.30);
        const gatedBeat = applySoftThreshold(targetBeat, 0.45);
        const deltaSeconds = Math.min(elapsed / 1000, 1 / 30);
        const bassTimeConstant = gatedBass > this.bassBody ? 0.08 : 0.30;
        const bassFollow = 1 - Math.exp(-deltaSeconds / bassTimeConstant);
        this.bassBody += (gatedBass - this.bassBody) * bassFollow;

        // 鼓点直接抬起呼吸，再独立慢放；不能把它交给流体旋转或对称弹簧，
        // 否则密集鼓点会被抹成恒定值，视觉上只剩流动速度一卡一卡。
        this.beatImpulse = Math.max(gatedBeat, this.beatImpulse * Math.exp(-deltaSeconds / 0.18));
        this.breath = Math.min(1, this.bassBody * 0.32 + this.beatImpulse * 0.68);
        this.renderMesh(time);
        this.present();
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
        if (active) this.requestFrame();
        else {
            this.cancelFrame();
            this.breath = 0;
            this.bassBody = 0;
            this.beatImpulse = 0;
        }
    }

    setVisible(visible: boolean) {
        this.visible = visible;
        if (visible) this.requestFrame();
        else this.cancelFrame();
    }

    private uploadArtwork(imageData: ImageData) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.artworkTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
        this.configureArtworkTexture();
    }

    async setArtwork(src: string) {
        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`封面读取失败：${response.status}`);
            const bitmap = await createImageBitmap(await response.blob(), {
                resizeWidth: 32,
                resizeHeight: 32,
                resizeQuality: 'low',
            });
            if (this.disposed) {
                bitmap.close();
                return;
            }
            this.uploadArtwork(preprocessArtwork(bitmap));
            bitmap.close();
            this.updateMesh(hashSource(src));
            this.requestFrame();
        } catch (error) {
            try {
                const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const element = new Image();
                    element.crossOrigin = 'anonymous';
                    element.onload = () => resolve(element);
                    element.onerror = () => reject(new Error('封面图片解码失败'));
                    element.src = src;
                });
                if (this.disposed) return;
                this.uploadArtwork(preprocessArtwork(image));
                this.updateMesh(hashSource(src));
                this.requestFrame();
            } catch (fallbackError) {
                console.error('网格背景封面加载失败', error, fallbackError);
            }
        }
    }

    dispose() {
        this.disposed = true;
        this.cancelFrame();
        if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
        if (this.target) {
            this.gl.deleteFramebuffer(this.target.framebuffer);
            this.gl.deleteTexture(this.target.texture);
        }
        this.gl.deleteTexture(this.artworkTexture);
        this.gl.deleteBuffer(this.meshVertexBuffer);
        this.gl.deleteBuffer(this.meshIndexBuffer);
        this.gl.deleteBuffer(this.quadBuffer);
        this.gl.deleteProgram(this.meshProgram.program);
        this.gl.deleteProgram(this.presentProgram.program);
    }
}

export function FluidBackground({
    src,
    active,
    lowFrequencyRef,
}: {
    src: string;
    active: boolean;
    lowFrequencyRef?: RefObject<LowFrequencyFrame>;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<AppleMusicFluidRenderer | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let renderer: AppleMusicFluidRenderer;
        try {
            renderer = new AppleMusicFluidRenderer(canvas, lowFrequencyRef);
        } catch (error) {
            console.error('网格背景初始化失败', error);
            return;
        }
        rendererRef.current = renderer;
        void renderer.setArtwork(src);
        const resizeObserver = new ResizeObserver(() => renderer.resize());
        resizeObserver.observe(canvas);
        const handleVisibility = () => renderer.setVisible(!document.hidden);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            resizeObserver.disconnect();
            renderer.dispose();
            rendererRef.current = null;
        };
    }, [lowFrequencyRef, src]);

    useEffect(() => {
        rendererRef.current?.setActive(active);
    }, [active]);

    return <canvas ref={canvasRef} className="invisible absolute inset-0 h-full w-full" aria-hidden />;
}
