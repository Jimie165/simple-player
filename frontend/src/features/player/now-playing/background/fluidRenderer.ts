import type { RefObject } from 'react';

import {
    AudioResponse,
    type LowFrequencyFrame,
} from '@/features/player/now-playing/background/audioResponse';
import { ARTWORK_TEXTURE_SIZE, preprocessArtwork } from '@/features/player/now-playing/background/artworkPreprocess';
import { createMesh, meshMorphMix } from '@/features/player/now-playing/background/meshGradient';

const RENDER_SCALE = 0.75;
const FLOW_SPEED = 0.2;
const ARTWORK_TRANSITION_MS = 500;
const MATERIAL_SIZE = 128;

const MESH_VERTEX_SHADER = `
precision highp float;
attribute vec2 a_position;
attribute vec2 a_morphPosition;
attribute vec2 a_uv;
varying vec2 v_uv;
uniform float u_aspect;
uniform float u_meshMix;
void main() {
    v_uv = a_uv;
    vec2 position = mix(a_position, a_morphPosition, u_meshMix);
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
uniform float u_colorScale;
uniform float u_alpha;

const float INV_255 = 1.0 / 255.0;
const float HALF_INV_255 = 0.5 / 255.0;

float gradientNoise(vec2 coordinate) {
    return fract(52.9829189 * fract(dot(coordinate, vec2(0.06711056, 0.00583715))));
}

void main() {
    vec3 color = texture2D(u_texture, v_uv).rgb;

    color *= u_colorScale;

    // 使用显示空间亮度平滑保护暗部，避免暗角把深色边缘继续压黑。
    float brightness = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float highlightWeight = smoothstep(0.18, 0.65, brightness);
    float edgeWeight = smoothstep(0.3, 0.8, distance(v_uv, vec2(0.5)));
    color *= 1.0 - 0.4 * edgeWeight * highlightWeight;

    float dither = INV_255 * gradientNoise(gl_FragCoord.xy) - HALF_INV_255;
    color += vec3(dither);

    gl_FragColor = vec4(color, u_alpha);
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

const MATERIAL_FRAGMENT_SHADER = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform vec4 u_rotation01;
uniform vec2 u_rotation2;
uniform float u_pulseScale;
vec2 inverseRotate(vec2 p, vec2 rotation) {
    return vec2(rotation.x * p.x + rotation.y * p.y,
        -rotation.y * p.x + rotation.x * p.y);
}
vec3 layer(vec3 under, vec2 p, vec2 offset, float size, vec2 rotation, float pulseScale) {
    // Scale after subtracting the layer's offset: its anchor must not move with the beat.
    vec2 uv = inverseRotate((p - offset) / (size * pulseScale), rotation) * 0.5 + 0.5;
    float coverage = step(0.0, uv.x) * step(uv.x, 1.0)
        * step(0.0, uv.y) * step(uv.y, 1.0);
    return mix(under, texture2D(u_texture, clamp(uv, 0.0, 1.0)).rgb, coverage);
}
void main() {
    vec3 color = texture2D(u_texture, v_uv).rgb;
    vec2 p = v_uv * 2.0 - 1.0;
    // Let the offset layers carry the beat instead of enlarging the entire material.
    float mainScale = 1.0 + (u_pulseScale - 1.0) * 0.35;
    color = layer(color, p, vec2(0.0), 1.4, u_rotation01.xy, mainScale);
    color = layer(color, p, vec2(-0.25, 0.15), 0.7, u_rotation01.zw, u_pulseScale);
    color = layer(color, inverseRotate(p, u_rotation01.xy),
        vec2(0.7), 0.7, u_rotation2, u_pulseScale);
    gl_FragColor = vec4(color, 1.0);
}
`;

const BLUR_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_direction;
void main() {
    // Normalized Gaussian (sigma 10, radius 24), pairing adjacent texels with linear filtering.
    vec3 color = texture2D(u_texture, v_uv).rgb * 0.04047074;
    color += (texture2D(u_texture, v_uv + u_direction * 1.496250).rgb
        + texture2D(u_texture, v_uv - u_direction * 1.496250).rgb) * 0.07993826;
    color += (texture2D(u_texture, v_uv + u_direction * 3.491251).rgb
        + texture2D(u_texture, v_uv - u_direction * 3.491251).rgb) * 0.07604913;
    color += (texture2D(u_texture, v_uv + u_direction * 5.486253).rgb
        + texture2D(u_texture, v_uv - u_direction * 5.486253).rgb) * 0.06951931;
    color += (texture2D(u_texture, v_uv + u_direction * 7.481259).rgb
        + texture2D(u_texture, v_uv - u_direction * 7.481259).rgb) * 0.06106442;
    color += (texture2D(u_texture, v_uv + u_direction * 9.476268).rgb
        + texture2D(u_texture, v_uv - u_direction * 9.476268).rgb) * 0.05153979;
    color += (texture2D(u_texture, v_uv + u_direction * 11.471282).rgb
        + texture2D(u_texture, v_uv - u_direction * 11.471282).rgb) * 0.04179926;
    color += (texture2D(u_texture, v_uv + u_direction * 13.466301).rgb
        + texture2D(u_texture, v_uv - u_direction * 13.466301).rgb) * 0.03257362;
    color += (texture2D(u_texture, v_uv + u_direction * 15.461327).rgb
        + texture2D(u_texture, v_uv - u_direction * 15.461327).rgb) * 0.02439130;
    color += (texture2D(u_texture, v_uv + u_direction * 17.456361).rgb
        + texture2D(u_texture, v_uv - u_direction * 17.456361).rgb) * 0.01754992;
    color += (texture2D(u_texture, v_uv + u_direction * 19.451404).rgb
        + texture2D(u_texture, v_uv - u_direction * 19.451404).rgb) * 0.01213352;
    color += (texture2D(u_texture, v_uv + u_direction * 21.446456).rgb
        + texture2D(u_texture, v_uv - u_direction * 21.446456).rgb) * 0.00806064;
    color += (texture2D(u_texture, v_uv + u_direction * 23.441519).rgb
        + texture2D(u_texture, v_uv - u_direction * 23.441519).rgb) * 0.00514545;
    gl_FragColor = vec4(color, 1.0);
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
    private readonly materialProgram: ProgramInfo;
    private readonly blurProgram: ProgramInfo;
    private readonly quadBuffer: WebGLBuffer;
    private meshStates: MeshState[] = [];
    private target: RenderTarget | null = null;
    private blurTarget: RenderTarget | null = null;
    private animationFrame = 0;
    private lastFrame = 0;
    private lastAudioFrame = 0;
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
            ['a_position', 'a_morphPosition', 'a_uv'],
            ['u_texture', 'u_colorScale', 'u_aspect', 'u_meshMix', 'u_alpha'],
        );
        this.materialProgram = compileProgram(
            gl,
            QUAD_VERTEX_SHADER,
            MATERIAL_FRAGMENT_SHADER,
            ['a_position'],
            ['u_texture', 'u_rotation01', 'u_rotation2', 'u_pulseScale'],
        );
        this.blurProgram = compileProgram(
            gl, QUAD_VERTEX_SHADER, BLUR_FRAGMENT_SHADER,
            ['a_position'], ['u_texture', 'u_direction'],
        );

        gl.activeTexture(gl.TEXTURE0);
        gl.useProgram(this.meshProgram.program);
        gl.uniform1i(this.meshProgram.uniforms.u_texture, 0);
        for (const program of [this.materialProgram, this.blurProgram]) {
            gl.useProgram(program.program);
            gl.uniform1i(program.uniforms.u_texture, 0);
        }

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
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
        if (!texture || !framebuffer) {
            if (texture) gl.deleteTexture(texture);
            if (framebuffer) gl.deleteFramebuffer(framebuffer);
            throw new Error('无法创建网格背景离屏缓冲区');
        }
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
        if (!this.target) {
            const target = this.createTarget(MATERIAL_SIZE, MATERIAL_SIZE);
            try {
                this.blurTarget = this.createTarget(MATERIAL_SIZE, MATERIAL_SIZE);
                this.target = target;
            } catch (error) {
                this.gl.deleteFramebuffer(target.framebuffer);
                this.gl.deleteTexture(target.texture);
                throw error;
            }
        }
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.useProgram(this.meshProgram.program);
        this.gl.uniform1f(this.meshProgram.uniforms.u_aspect, width / height);
        // 修改 canvas backing store 会立即清空默认 framebuffer。必须在同一任务中
        // 完成新尺寸的首帧呈现，避免全屏切换时把清空后的黑帧交给合成器。
        const now = performance.now();
        this.renderFrame(now);
        this.canvas.style.visibility = 'visible';
        this.requestFrame();
    }

    private bindTexture(texture: WebGLTexture) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    }

    private prepareMeshFrame(time: number) {
        const gl = this.gl;
        const program = this.meshProgram;
        gl.useProgram(program.program);
        gl.uniform1f(program.uniforms.u_meshMix, meshMorphMix(time - this.startTime));
        gl.uniform1f(
            program.uniforms.u_colorScale,
            1,
        );
    }

    private renderMesh(state: MeshState) {
        if (!this.target) return;
        const gl = this.gl;
        const program = this.meshProgram;
        gl.useProgram(program.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(program.uniforms.u_alpha, easeInOutSine(state.alpha));
        gl.bindBuffer(gl.ARRAY_BUFFER, state.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.indexBuffer);
        gl.enableVertexAttribArray(program.attributes.a_position);
        gl.vertexAttribPointer(program.attributes.a_position, 2, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(program.attributes.a_morphPosition);
        gl.vertexAttribPointer(program.attributes.a_morphPosition, 2, gl.FLOAT, false, 24, 8);
        gl.enableVertexAttribArray(program.attributes.a_uv);
        gl.vertexAttribPointer(program.attributes.a_uv, 2, gl.FLOAT, false, 24, 16);
        this.bindTexture(this.target.texture);
        gl.drawElements(gl.TRIANGLES, state.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    private renderMaterial(state: MeshState, time: number) {
        if (!this.target || !this.blurTarget) return;
        const gl = this.gl;
        const program = this.materialProgram;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.framebuffer);
        gl.viewport(0, 0, MATERIAL_SIZE, MATERIAL_SIZE);
        gl.disable(gl.BLEND);
        gl.useProgram(program.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        // Quad passes must not retain attributes backed by a replaced mesh's deleted buffers.
        gl.disableVertexAttribArray(this.meshProgram.attributes.a_position);
        gl.disableVertexAttribArray(this.meshProgram.attributes.a_morphPosition);
        gl.disableVertexAttribArray(this.meshProgram.attributes.a_uv);
        gl.enableVertexAttribArray(program.attributes.a_position);
        gl.vertexAttribPointer(program.attributes.a_position, 2, gl.FLOAT, false, 0, 0);
        this.bindTexture(state.texture);
        const angle = ((time - this.startTime) / 10000) * FLOW_SPEED * 2;
        gl.uniform4f(program.uniforms.u_rotation01,
            Math.cos(angle), Math.sin(angle), Math.cos(angle * 120 / 70), Math.sin(angle * 120 / 70));
        gl.uniform2f(program.uniforms.u_rotation2, Math.cos(angle * 120 / 90), Math.sin(angle * 120 / 90));
        gl.uniform1f(program.uniforms.u_pulseScale, this.audioResponse.scale);
        // Material and mesh share a square domain; apply viewport aspect only in the mesh.
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.useProgram(this.blurProgram.program);
        gl.enableVertexAttribArray(this.blurProgram.attributes.a_position);
        gl.vertexAttribPointer(this.blurProgram.attributes.a_position, 2, gl.FLOAT, false, 0, 0);
        // Blur the changing layer boundaries, not the source artwork. All taps stay low-res.
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurTarget.framebuffer);
        this.bindTexture(this.target.texture);
        gl.uniform2f(this.blurProgram.uniforms.u_direction, 1 / MATERIAL_SIZE, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.framebuffer);
        this.bindTexture(this.blurTarget.texture);
        gl.uniform2f(this.blurProgram.uniforms.u_direction, 0, 1 / MATERIAL_SIZE);
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
            const state = this.meshStates[index];
            this.renderMaterial(state, time);
            this.renderMesh(state);
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
        const audioElapsed = this.lastAudioFrame === 0 ? frameInterval : time - this.lastAudioFrame;
        this.lastAudioFrame = time;
        this.audioResponse.update(this.lowFrequencyRef?.current, audioElapsed, time);
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
            this.lastAudioFrame = 0;
        }
    }

    setVisible(visible: boolean) {
        this.visible = visible;
        if (visible) this.requestFrame();
        else {
            this.cancelFrame();
            this.audioResponse.reset();
            this.lastAudioFrame = 0;
        }
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
                resizeWidth: ARTWORK_TEXTURE_SIZE,
                resizeHeight: ARTWORK_TEXTURE_SIZE,
                resizeQuality: 'high',
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
        if (this.blurTarget) {
            this.gl.deleteFramebuffer(this.blurTarget.framebuffer);
            this.gl.deleteTexture(this.blurTarget.texture);
        }
        for (const state of this.meshStates) this.deleteMeshState(state);
        this.meshStates = [];
        this.gl.deleteBuffer(this.quadBuffer);
        this.gl.deleteProgram(this.meshProgram.program);
        this.gl.deleteProgram(this.materialProgram.program);
        this.gl.deleteProgram(this.blurProgram.program);
    }
}
