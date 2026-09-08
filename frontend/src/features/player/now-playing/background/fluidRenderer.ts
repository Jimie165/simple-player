import type { RefObject } from 'react';

import {
    AudioResponse,
    type LowFrequencyFrame,
} from '@/features/player/now-playing/background/audioResponse';
import { preprocessArtwork } from '@/features/player/now-playing/background/artworkPreprocess';
import { createMesh } from '@/features/player/now-playing/background/meshGradient';

const RENDER_SCALE = 0.75;
const FLOW_SPEED = 0.2;
const ARTWORK_TRANSITION_MS = 500;

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
uniform vec4 u_uvTransform;
uniform float u_colorScale;

const float INV_255 = 1.0 / 255.0;
const float HALF_INV_255 = 0.5 / 255.0;

float gradientNoise(vec2 coordinate) {
    return fract(52.9829189 * fract(dot(coordinate, vec2(0.06711056, 0.00583715))));
}

void main() {
    vec2 finalUV = vec2(
        u_uvTransform.x * v_uv.x - u_uvTransform.y * v_uv.y + u_uvTransform.z,
        u_uvTransform.y * v_uv.x + u_uvTransform.x * v_uv.y + u_uvTransform.w
    );
    vec3 color = texture2D(u_texture, finalUV).rgb;

    color *= u_colorScale;

    float dither = INV_255 * gradientNoise(gl_FragCoord.xy) - HALF_INV_255;
    color += vec3(dither);

    float distanceFromCenter = distance(v_uv, vec2(0.5));
    float vignette = smoothstep(0.8, 0.3, distanceFromCenter);
    color *= 0.6 + vignette * 0.4;
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
uniform float u_alpha;
void main() {
    vec4 color = texture2D(u_texture, v_uv);
    gl_FragColor = vec4(color.rgb, color.a * u_alpha);
}
`;

interface ProgramInfo {
    program: WebGLProgram;
    attributes: Record<string, number>;
    uniforms: Record<string, WebGLUniformLocation | null>;
}

interface RenderTarget {
    framebuffer: WebGLFramebuffer;
    texture: WebGLTexture;
}

interface MeshState {
    vertexBuffer: WebGLBuffer;
    indexBuffer: WebGLBuffer;
    texture: WebGLTexture;
    indexCount: number;
    alpha: number;
}

const easeInOutSine = (value: number) => -(Math.cos(Math.PI * value) - 1) / 2;

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

export class FluidRenderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly lowFrequencyRef?: RefObject<LowFrequencyFrame>;
    private readonly gl: WebGLRenderingContext;
    private readonly meshProgram: ProgramInfo;
    private readonly presentProgram: ProgramInfo;
    private readonly quadBuffer: WebGLBuffer;
    private meshStates: MeshState[] = [];
    private target: RenderTarget | null = null;
    private animationFrame = 0;
    private lastFrame = 0;
    private startTime = performance.now();
    private artworkRequest = 0;
    private hasArtwork = false;
    private readonly audioResponse = new AudioResponse();
    private active = true;
    private visible = !document.hidden;
    private disposed = false;
    private resizeTimer: number | null = null;

    constructor(canvas: HTMLCanvasElement, lowFrequencyRef?: RefObject<LowFrequencyFrame>) {
        this.canvas = canvas;
        this.lowFrequencyRef = lowFrequencyRef;
        const gl = canvas.getContext('webgl', {
            alpha: false,
            antialias: true,
            depth: false,
        });
        if (!gl) throw new Error('当前环境不支持 WebGL 背景');
        this.gl = gl;
        this.meshProgram = compileProgram(
            gl,
            MESH_VERTEX_SHADER,
            MESH_FRAGMENT_SHADER,
            ['a_position', 'a_uv'],
            ['u_texture', 'u_uvTransform', 'u_colorScale', 'u_aspect'],
        );
        this.presentProgram = compileProgram(
            gl,
            QUAD_VERTEX_SHADER,
            PRESENT_FRAGMENT_SHADER,
            ['a_position'],
            ['u_texture', 'u_alpha'],
        );

        gl.activeTexture(gl.TEXTURE0);
        gl.useProgram(this.meshProgram.program);
        gl.uniform1i(this.meshProgram.uniforms.u_texture, 0);
        gl.useProgram(this.presentProgram.program);
        gl.uniform1i(this.presentProgram.uniforms.u_texture, 0);

        const quadBuffer = gl.createBuffer();
        if (!quadBuffer) throw new Error('无法创建网格背景缓冲区');
        this.quadBuffer = quadBuffer;

        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        this.meshStates.push(this.createMeshState());
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

    private createMeshState(imageData?: ImageData): MeshState {
        const gl = this.gl;
        const vertexBuffer = gl.createBuffer();
        const indexBuffer = gl.createBuffer();
        const texture = gl.createTexture();
        if (!vertexBuffer || !indexBuffer || !texture) {
            if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
            if (indexBuffer) gl.deleteBuffer(indexBuffer);
            if (texture) gl.deleteTexture(texture);
            throw new Error('无法创建网格背景状态');
        }
        try {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
            if (imageData) {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
            } else {
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
            }
            this.configureArtworkTexture();

            const { vertices, indices } = createMesh();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            return {
                vertexBuffer,
                indexBuffer,
                texture,
                indexCount: indices.length,
                alpha: 1,
            };
        } catch (error) {
            gl.deleteBuffer(vertexBuffer);
            gl.deleteBuffer(indexBuffer);
            gl.deleteTexture(texture);
            throw error;
        }
    }

    private deleteMeshState(state: MeshState) {
        this.gl.deleteBuffer(state.vertexBuffer);
        this.gl.deleteBuffer(state.indexBuffer);
        this.gl.deleteTexture(state.texture);
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
        const pixelScale = window.devicePixelRatio * RENDER_SCALE;
        const width = Math.max(2, Math.ceil(this.canvas.clientWidth * pixelScale));
        const height = Math.max(2, Math.ceil(this.canvas.clientHeight * pixelScale));
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
        this.gl.useProgram(this.meshProgram.program);
        this.gl.uniform1f(this.meshProgram.uniforms.u_aspect, width / height);
        // 修改 canvas backing store 会立即清空默认 framebuffer。必须在同一任务中
        // 完成新 FBO 的首帧呈现，避免全屏切换时把清空后的黑帧交给合成器。
        const now = performance.now();
        this.renderFrame(now);
        this.canvas.style.visibility = 'visible';
        if (previous) {
            this.gl.deleteFramebuffer(previous.framebuffer);
            this.gl.deleteTexture(previous.texture);
        }
        this.requestFrame();
    }

    private bindTexture(texture: WebGLTexture) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    }

    private prepareMeshFrame(time: number) {
        const motion = this.audioResponse.motion;
        const angle = (
            ((time - this.startTime) / 10000) * FLOW_SPEED
            + motion * 0.1
        ) * 2;
        const scale = Math.max(0.001, 1 - motion * 0.2);
        const cosine = Math.cos(angle) * scale;
        const sine = Math.sin(angle) * scale;

        const gl = this.gl;
        const program = this.meshProgram;
        gl.useProgram(program.program);
        gl.uniform4f(
            program.uniforms.u_uvTransform,
            cosine,
            sine,
            0.5 - 0.2 * cosine + 0.2 * sine,
            0.5 - 0.2 * sine - 0.2 * cosine,
        );
        gl.uniform1f(
            program.uniforms.u_colorScale,
            1 - this.audioResponse.luminance * 0.04,
        );
    }

    private renderMesh(state: MeshState) {
        if (!this.target) return;
        const gl = this.gl;
        const program = this.meshProgram;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.framebuffer);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindBuffer(gl.ARRAY_BUFFER, state.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.indexBuffer);
        gl.enableVertexAttribArray(program.attributes.a_position);
        gl.vertexAttribPointer(program.attributes.a_position, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(program.attributes.a_uv);
        gl.vertexAttribPointer(program.attributes.a_uv, 2, gl.FLOAT, false, 16, 8);
        this.bindTexture(state.texture);
        gl.drawElements(gl.TRIANGLES, state.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    private present(alpha: number) {
        if (!this.target) return;
        const gl = this.gl;
        const program = this.presentProgram;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(program.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(program.attributes.a_position);
        gl.vertexAttribPointer(program.attributes.a_position, 2, gl.FLOAT, false, 0, 0);
        this.bindTexture(this.target.texture);
        gl.uniform1f(program.uniforms.u_alpha, alpha);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    private renderFrame(time: number) {
        if (!this.target) return;
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.prepareMeshFrame(time);
        for (let index = 0; index < this.meshStates.length; index += 1) {
            if (index > 0) gl.useProgram(this.meshProgram.program);
            const state = this.meshStates[index];
            this.renderMesh(state);
            this.present(easeInOutSine(state.alpha));
        }
    }

    private advanceArtworkTransition(elapsed: number) {
        for (let index = 1; index < this.meshStates.length; index += 1) {
            const state = this.meshStates[index];
            state.alpha = Math.min(1, state.alpha + elapsed / ARTWORK_TRANSITION_MS);
        }

        let latestOpaqueIndex = -1;
        for (let index = 1; index < this.meshStates.length; index += 1) {
            if (this.meshStates[index].alpha >= 1) latestOpaqueIndex = index;
        }
        if (latestOpaqueIndex <= 0) return;
        const obsoleteStates = this.meshStates.splice(0, latestOpaqueIndex);
        for (const state of obsoleteStates) this.deleteMeshState(state);
    }

    private draw = (time: number) => {
        this.animationFrame = 0;
        if (!this.active || !this.visible || this.disposed || !this.target) return;
        const elapsed = time - this.lastFrame;
        const frameInterval = 1000 / 30;
        if (elapsed < frameInterval) {
            this.requestFrame();
            return;
        }
        this.lastFrame = time - elapsed % frameInterval;
        this.audioResponse.update(this.lowFrequencyRef?.current, elapsed);
        this.advanceArtworkTransition(elapsed);
        this.renderFrame(time);
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
            this.audioResponse.reset();
        }
    }

    setVisible(visible: boolean) {
        this.visible = visible;
        if (visible) this.requestFrame();
        else this.cancelFrame();
    }

    private addArtworkState(imageData: ImageData) {
        const nextState = this.createMeshState(imageData);
        if (!this.hasArtwork || !this.active || !this.visible) {
            for (const state of this.meshStates) this.deleteMeshState(state);
            nextState.alpha = 1;
            this.meshStates = [nextState];
            this.hasArtwork = true;
        } else {
            nextState.alpha = 0;
            this.meshStates.push(nextState);
        }
        this.requestFrame();
    }

    async setArtwork(src: string) {
        const request = ++this.artworkRequest;
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
            let imageData: ImageData;
            try {
                imageData = preprocessArtwork(bitmap);
            } finally {
                bitmap.close();
            }
            if (this.disposed || request !== this.artworkRequest) return;
            this.addArtworkState(imageData);
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
                this.addArtworkState(preprocessArtwork(image));
            } catch (fallbackError) {
                if (request !== this.artworkRequest) return;
                console.error('网格背景封面加载失败', error, fallbackError);
            }
        }
    }

    dispose() {
        this.disposed = true;
        this.artworkRequest += 1;
        this.cancelFrame();
        if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
        if (this.target) {
            this.gl.deleteFramebuffer(this.target.framebuffer);
            this.gl.deleteTexture(this.target.texture);
        }
        for (const state of this.meshStates) this.deleteMeshState(state);
        this.meshStates = [];
        this.gl.deleteBuffer(this.quadBuffer);
        this.gl.deleteProgram(this.meshProgram.program);
        this.gl.deleteProgram(this.presentProgram.program);
    }
}
