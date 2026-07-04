import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BlurredCoverBackground } from '@/features/player/apple/background/BlurredCoverBackground';

// --- WebGL Shaders ---

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    // 渲染全屏四边形
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

// 片段着色器：超低频 2D 面片大幅揉挤流动（完美对标图 2 大色块无波纹）
const FRAGMENT_SHADER = `
  precision highp float;
  
  uniform sampler2D u_image;
  uniform float u_time;
  uniform vec2 u_resolution;
    uniform float u_ditherStrength;
  
  varying vec2 v_texCoord;

  // 基础 2D 噪声函数
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

  void main() {
      // 极慢的光滑位移
      float time = u_time * 0.0001;
      
      // 采样接近整张封面，让边缘和底部的色块也参与背景流动。
      vec2 p = (v_texCoord - 0.5) * 0.94;
      
      // 经典的无尽缠绕流体扭曲（Iterative Sine Warp）
      // 这是一套极其温和稳定的流体力学算法，它不会像 snoise + cos 一样形成孤立的斑点（细胞感）
      // 它的本质是利用正弦波长远大于画面的性质，在全屏进行极度开阔的“风偏”
      vec2 newp = p;
      for (float i = 1.0; i <= 2.0; i++) {
          newp.x += 0.13 / i * sin(i * p.y + time + 0.3);
          newp.y += 0.13 / i * cos(i * p.x + time + 0.3);
          p = newp;
      }
      
      // 我们再利用这种大尺度的无尽缠绕，通过加上极低频的噪声，彻底揉碎图形结构，呈现为巨大的云彩流体色块
      float dx = snoise(p + vec2(time, 0.0)) * 0.14;
      float dy = snoise(p + vec2(0.0, time * 0.8)) * 0.14;
      
      // 提取颜色，采用平滑宽容的映射，绝对不折返
      vec2 sampleUV = clamp(p + vec2(dx, dy) + 0.5, 0.0, 1.0);
      
            vec4 color = texture2D(u_image, sampleUV);

            // 压缩高亮区域，避免白色或浅色封面在流体背景里过分刺眼
            float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            float highlightCompress = smoothstep(0.58, 1.0, luma);
            color.rgb *= mix(0.95, 0.72, highlightCompress);
            color.rgb = mix(color.rgb, vec3(luma), 0.10 * highlightCompress);

            // 轻微提亮并中和冷色压暗，保持初版质感但整体不那么沉。
            vec3 softTint = vec3(0.18, 0.18, 0.17);
            color.rgb = mix(color.rgb, softTint, 0.08);
            color.rgb = pow(color.rgb, vec3(0.96));

            // 轻量抖动：把可见色带打散为细微颗粒
            vec2 px = gl_FragCoord.xy;
            vec3 dither = vec3(
                hash(px + vec2(0.0, 0.0)),
                hash(px + vec2(13.1, 7.7)),
                hash(px + vec2(31.7, 19.3))
            );
            color.rgb += (dither - 0.5) * u_ditherStrength;
            color.rgb = clamp(color.rgb, 0.0, 1.0);
      
      gl_FragColor = vec4(color.rgb, 1.0);
  }
`;

// --- WebGL Helper ---

const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
};

// 基础 1x1 像素占位图，防止 WebGL 纹理报错
const TRANSPARENT_PIXEL = new Uint8Array([0, 0, 0, 255]);

// --- React Component ---

const WebGLCanvas = ({ src, active }: { src: string | null; active: boolean }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const snapshotRef = useRef<HTMLImageElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const textureRef = useRef<WebGLTexture | null>(null);
    const requestRef = useRef<number>(0);
    const lastFrameRef = useRef<number>(0);
    const emaFrameTimeRef = useRef<number>(1000 / 30);
    const adaptiveScaleFactorRef = useRef<number>(1);
    const adaptCheckCounterRef = useRef<number>(0);
    const isVisibleRef = useRef<boolean>(true);
    const isActiveRef = useRef<boolean>(active);
    const scaleRef = useRef<number>(0.3);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const BASE_SCALE = 0.34;
        const FULLSCREEN_SCALE = 0.30;
        const LARGE_SCREEN_SCALE = 0.32;
        const LOW_MEMORY_SCALE = 0.26;
        const MIN_SCALE = 0.24;
        const ABS_MIN_SCALE = 0.2;
        const ADAPTIVE_MIN_FACTOR = 0.78;
        const ADAPTIVE_MAX_FACTOR = 1.0;
        const ADAPTIVE_STEP = 0.03;
        const ADAPTIVE_HIGH_MS = 44;
        const ADAPTIVE_LOW_MS = 34;
        const ADAPTIVE_CHECK_EVERY = 20;
        const TARGET_FPS = 30;
        const FRAME_INTERVAL = 1000 / TARGET_FPS;

        const getResolutionScale = () => {
            const area = window.innerWidth * window.innerHeight;
            const isFullscreen = !!document.fullscreenElement;
            const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;

            let scale = BASE_SCALE;
            if (area >= 1920 * 1080) scale = LARGE_SCREEN_SCALE;
            if (isFullscreen) scale = Math.min(scale, FULLSCREEN_SCALE);
            if (deviceMemory <= 4) scale = Math.min(scale, LOW_MEMORY_SCALE);

            return Math.max(scale, MIN_SCALE);
        };

        const gl = canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            desynchronized: true,
            powerPreference: 'low-power',
        });

        if (!gl) {
            console.error('WebGL not supported');
            return;
        }
        glRef.current = gl;

        // 初始化着色器
        const vShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
        const fShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        if (!vShader || !fShader) return;

        const program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return;
        }
        programRef.current = program;
        gl.useProgram(program);
        gl.detachShader(program, vShader);
        gl.detachShader(program, fShader);
        gl.deleteShader(vShader);
        gl.deleteShader(fShader);

        // 设置全屏矩形顶点位置
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                -1.0, -1.0,
                1.0, -1.0,
                -1.0, 1.0,
                -1.0, 1.0,
                1.0, -1.0,
                1.0, 1.0,
            ]),
            gl.STATIC_DRAW
        );

        const positionLocation = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // 设置纹理坐标
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                0.0, 1.0,
                1.0, 1.0,
                0.0, 0.0,
                0.0, 0.0,
                1.0, 1.0,
                1.0, 0.0,
            ]),
            gl.STATIC_DRAW
        );

        const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        // 初始化纹理
        const texture = gl.createTexture();
        textureRef.current = texture;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // 使用占位符避免未加载时报错
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, TRANSPARENT_PIXEL);

        // 恢复为 CLAMP_TO_EDGE 避免镜面折叠造成的“油膜反波浪线”
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Uniform 变量位置
        const timeLocation = gl.getUniformLocation(program, 'u_time');
        const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
        const ditherStrengthLocation = gl.getUniformLocation(program, 'u_ditherStrength');

        // 绑定窗口变化事件
        const updateSize = () => {
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            const baseScale = getResolutionScale();
            scaleRef.current = Math.max(
                ABS_MIN_SCALE,
                baseScale * adaptiveScaleFactorRef.current
            );
            // 降低渲染分辨率
            canvas.width = Math.floor(width * scaleRef.current);
            canvas.height = Math.floor(height * scaleRef.current);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        document.addEventListener('fullscreenchange', updateSize);

        // 渲染循环
        const render = (time: number) => {
            if (!gl || !program) return;
            if (!isVisibleRef.current || !isActiveRef.current) return;

            const elapsed = time - lastFrameRef.current;

            // 使用 EMA 统计当前帧耗时，驱动自适应降级。
            if (lastFrameRef.current > 0) {
                emaFrameTimeRef.current = emaFrameTimeRef.current * 0.9 + elapsed * 0.1;
                adaptCheckCounterRef.current += 1;
                if (adaptCheckCounterRef.current >= ADAPTIVE_CHECK_EVERY) {
                    adaptCheckCounterRef.current = 0;
                    const ema = emaFrameTimeRef.current;
                    let nextFactor = adaptiveScaleFactorRef.current;
                    if (ema > ADAPTIVE_HIGH_MS) {
                        nextFactor = Math.max(ADAPTIVE_MIN_FACTOR, nextFactor - ADAPTIVE_STEP);
                    } else if (ema < ADAPTIVE_LOW_MS) {
                        nextFactor = Math.min(ADAPTIVE_MAX_FACTOR, nextFactor + ADAPTIVE_STEP * 0.5);
                    }

                    if (Math.abs(nextFactor - adaptiveScaleFactorRef.current) > 0.001) {
                        adaptiveScaleFactorRef.current = nextFactor;
                        updateSize();
                    }
                }
            }

            if (time - lastFrameRef.current < FRAME_INTERVAL) {
                requestRef.current = requestAnimationFrame(render);
                return;
            }

            lastFrameRef.current = time;
            gl.uniform1f(timeLocation, time);

            if (ditherStrengthLocation) {
                const ditherStrength =
                    scaleRef.current <= 0.28 ? 0.0 : (scaleRef.current <= 0.32 ? 0.5 / 255.0 : 1.0 / 255.0);
                gl.uniform1f(ditherStrengthLocation, ditherStrength);
            }

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            canvas.style.visibility = 'visible';
            if (snapshotRef.current) snapshotRef.current.style.display = 'none';
            requestRef.current = requestAnimationFrame(render);
        };
        const handleVisibility = () => {
            isVisibleRef.current = !document.hidden;
            if (isVisibleRef.current && isActiveRef.current) {
                lastFrameRef.current = performance.now();
                emaFrameTimeRef.current = FRAME_INTERVAL;
                adaptCheckCounterRef.current = 0;
                requestRef.current = requestAnimationFrame(render);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        const handleResume = () => {
            cancelAnimationFrame(requestRef.current);
            if (isVisibleRef.current && isActiveRef.current) {
                updateSize();
                canvas.style.visibility = 'hidden';
                if (snapshotRef.current?.src) snapshotRef.current.style.display = 'block';
                lastFrameRef.current = performance.now();
                requestRef.current = requestAnimationFrame(render);
            }
        };
        const handleSuspend = () => {
            cancelAnimationFrame(requestRef.current);
            if (snapshotRef.current?.src) snapshotRef.current.style.display = 'block';
            canvas.style.visibility = 'hidden';
            canvas.width = 1;
            canvas.height = 1;
            gl.viewport(0, 0, 1, 1);
        };
        window.addEventListener('player-background-resume', handleResume);
        window.addEventListener('player-background-suspend', handleSuspend);
        requestRef.current = requestAnimationFrame(render);

        return () => {
            window.removeEventListener('resize', updateSize);
            document.removeEventListener('fullscreenchange', updateSize);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('player-background-resume', handleResume);
            window.removeEventListener('player-background-suspend', handleSuspend);
            cancelAnimationFrame(requestRef.current);
            if (gl) {
                if (textureRef.current) gl.deleteTexture(textureRef.current);
                if (positionBuffer) gl.deleteBuffer(positionBuffer);
                if (texCoordBuffer) gl.deleteBuffer(texCoordBuffer);
                if (program) gl.deleteProgram(program);
            }
        };
    }, []);

    useEffect(() => {
        isActiveRef.current = active;
        cancelAnimationFrame(requestRef.current);
        if (active && !document.hidden) {
            window.dispatchEvent(new Event('player-background-resume'));
        } else {
            window.dispatchEvent(new Event('player-background-suspend'));
        }
    }, [active]);

    // 监听 src 变化，异步缩放解码；采样尺寸保持 256×256。
    useEffect(() => {
        const gl = glRef.current;
        const texture = textureRef.current;
        if (!gl || !texture || !src) return;

        let cancelled = false;
        let fallbackImage: HTMLImageElement | null = null;
        const size = 256;

        const uploadSource = (source: CanvasImageSource) => {
            if (cancelled) return;
            const offscreen = document.createElement('canvas');
            offscreen.width = size;
            offscreen.height = size;
            const ctx = offscreen.getContext('2d');
            if (!ctx) return;

            ctx.filter = 'blur(34px) saturate(170%)';
            ctx.drawImage(source, -16, -16, size + 32, size + 32);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);

            // 隐藏全屏播放器时用低分辨率静态图托底，Canvas 可安全缩到 1×1。
            if (snapshotRef.current) {
                snapshotRef.current.src = offscreen.toDataURL('image/jpeg', 0.78);
            }
        };

        const load = async () => {
            try {
                if ('createImageBitmap' in window) {
                    const response = await fetch(src);
                    if (!response.ok) throw new Error(`Cover fetch failed: ${response.status}`);
                    const blob = await response.blob();
                    const bitmap = await createImageBitmap(blob, {
                        resizeWidth: size,
                        resizeHeight: size,
                        resizeQuality: 'low',
                    });
                    try {
                        uploadSource(bitmap);
                    } finally {
                        bitmap.close();
                    }
                    return;
                }
            } catch (error) {
                console.warn('Background ImageBitmap decode failed, falling back to Image', error);
            }

            fallbackImage = new Image();
            fallbackImage.crossOrigin = 'anonymous';
            fallbackImage.onload = () => uploadSource(fallbackImage!);
            fallbackImage.src = src;
        };

        void load();
        return () => {
            cancelled = true;
            if (fallbackImage) {
                fallbackImage.onload = null;
                fallbackImage.src = '';
            }
        };
    }, [src]);

    return (
        <div className="relative w-full h-full overflow-hidden">
            <img
                ref={snapshotRef}
                alt=""
                aria-hidden
                className="absolute inset-0 hidden w-full h-full object-cover"
            />
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover"
            />
        </div>
    );
};
export const PlayerBackground = React.memo(({
    src,
    variant = 'fluid',
    active = true,
}: {
    src: string | null;
    variant?: 'fluid' | 'blurred';
    active?: boolean;
}) => {
    return (
        <div className="absolute inset-0 z-0 overflow-hidden select-none pointer-events-none bg-[#1a1a1a]">

            <div
                className="absolute inset-0 w-full h-full"
                // 放大一点掩盖边缘
                style={{ transform: 'scale(1.1)' }}
            >
                {variant === 'fluid' ? (
                    <AnimatePresence mode="popLayout">
                        {src && (
                            <motion.div
                                key={src}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1.5, ease: "easeInOut" }}
                                className="absolute inset-0 w-full h-full opacity-80 dark:opacity-60"
                            >
                                <WebGLCanvas src={src} active={active} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                ) : (
                    <BlurredCoverBackground src={src} />
                )}
            </div>

            {/* 轻灰雾统一背景，保留初版压白逻辑但略微提亮 */}
            <div className="absolute inset-0 bg-[#585854]/10 z-10 pointer-events-none" />
            {/* 用暗角收边，避免整屏均匀压暗产生脏块感 */}
            <div className="absolute inset-0 z-10 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(4,6,12,0.04)_62%,rgba(4,6,12,0.12)_100%)]" />
        </div>
    );
});
