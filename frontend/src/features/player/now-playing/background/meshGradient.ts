interface ControlPoint {
    x: number;
    y: number;
    uRotation: number;
    vRotation: number;
    uScale: number;
    vScale: number;
}

interface PreparedControlPoint extends ControlPoint {
    uTangentX: number;
    uTangentY: number;
    vTangentX: number;
    vTangentY: number;
}

type MeshModeName = 'calm' | 'balanced' | 'expressive';
type RandomSource = () => number;

interface MeshMode {
    name: MeshModeName;
    anchorCount: readonly [number, number];
    anchorRadius: readonly [number, number];
    anchorStrength: readonly [number, number];
    jitter: number;
    noise: number;
    borderSlide: number;
    quietChance: number;
    strongChance: number;
    strongRotation: number;
    targetDisplacement: number;
    maxInvertedFraction: number;
}

interface DeformationAnchor {
    u: number;
    v: number;
    radius: number;
    strength: number;
    angle: number;
    type: 'directional' | 'radial' | 'swirl';
    polarity: number;
}

interface ControlPointCandidate {
    points: ControlPoint[];
    score: number;
}

const MESH_MODES: Record<MeshModeName, MeshMode> = {
    calm: {
        name: 'calm',
        anchorCount: [1, 2],
        anchorRadius: [0.42, 0.72],
        anchorStrength: [0.16, 0.32],
        jitter: 0.035,
        noise: 0.06,
        borderSlide: 0.18,
        quietChance: 0.68,
        strongChance: 0.06,
        strongRotation: 28,
        targetDisplacement: 0.16,
        maxInvertedFraction: 0,
    },
    balanced: {
        name: 'balanced',
        anchorCount: [2, 3],
        anchorRadius: [0.36, 0.64],
        anchorStrength: [0.22, 0.44],
        jitter: 0.05,
        noise: 0.08,
        borderSlide: 0.26,
        quietChance: 0.56,
        strongChance: 0.12,
        strongRotation: 36,
        targetDisplacement: 0.22,
        maxInvertedFraction: 0,
    },
    expressive: {
        name: 'expressive',
        anchorCount: [2, 3],
        anchorRadius: [0.32, 0.58],
        anchorStrength: [0.28, 0.52],
        jitter: 0.065,
        noise: 0.1,
        borderSlide: 0.32,
        quietChance: 0.46,
        strongChance: 0.18,
        strongRotation: 44,
        targetDisplacement: 0.28,
        maxInvertedFraction: 0.001,
    },
};

const CANDIDATE_COUNT = 6;
const CANDIDATES_PER_STEP = 2;
const INITIAL_CANDIDATE_COUNT = 3;
const DEFAULT_CONTROL_SIZE = 5;
const MIN_CONTROL_POINT_GAP = 0.34;
const MAX_CONTROL_POINT_OFFSET = 0.52;

export const MORPH_SEGMENT_MS = 16_000;
export const DEFAULT_SPLINE_TENSION = 0.4;

/**
 * 计算四点 Catmull–Rom 样条在当前段 P1 -> P2 上的四个基函数权重。
 * 切线缩放系数 tension 默认取 0.4，在保证节点交接速度连续的同时抑制转向过冲。
 */
export function catmullRomWeights(
    progress: number,
    tension = DEFAULT_SPLINE_TENSION,
): readonly [number, number, number, number] {
    const t = clamp(progress, 0, 1);
    const tau = clamp(tension, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    return [
        -tau * t + 2 * tau * t2 - tau * t3,
        1 + (tau - 3) * t2 + (2 - tau) * t3,
        tau * t + (3 - 2 * tau) * t2 + (tau - 2) * t3,
        -tau * t2 + tau * t3,
    ];
}

function createRandom(seed: number): RandomSource {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    };
}

const randomRange = (random: RandomSource, minimum: number, maximum: number) => (
    minimum + random() * (maximum - minimum)
);

const randomInteger = (random: RandomSource, minimum: number, maximum: number) => (
    Math.floor(randomRange(random, minimum, maximum + 1))
);

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
    const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return normalized * normalized * (3 - 2 * normalized);
}

function noise(x: number, y: number) {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return value - Math.floor(value);
}

function smoothNoise(x: number, y: number) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const u = smoothstep(0, 1, x - x0);
    const v = smoothstep(0, 1, y - y0);
    const top = noise(x0, y0) * (1 - u) + noise(x0 + 1, y0) * u;
    const bottom = noise(x0, y0 + 1) * (1 - u) + noise(x0 + 1, y0 + 1) * u;
    return top * (1 - v) + bottom * v;
}

function chooseMode(random: RandomSource) {
    const value = random();
    if (value < 0.35) return MESH_MODES.calm;
    if (value < 0.85) return MESH_MODES.balanced;
    return MESH_MODES.expressive;
}

function createAnchors(random: RandomSource, mode: MeshMode): DeformationAnchor[] {
    const count = randomInteger(random, mode.anchorCount[0], mode.anchorCount[1]);
    return Array.from({ length: count }, () => ({
        u: randomRange(random, 0.16, 0.84),
        v: randomRange(random, 0.16, 0.84),
        radius: randomRange(random, mode.anchorRadius[0], mode.anchorRadius[1]),
        strength: randomRange(random, mode.anchorStrength[0], mode.anchorStrength[1]),
        angle: randomRange(random, -Math.PI, Math.PI),
        type: (['directional', 'radial', 'swirl'] as const)[randomInteger(random, 0, 2)],
        polarity: random() < 0.5 ? -1 : 1,
    }));
}

function anchorOffset(anchor: DeformationAnchor, u: number, v: number) {
    const deltaU = u - anchor.u;
    const deltaV = v - anchor.v;
    const distance = Math.hypot(deltaU, deltaV);
    const influence = 1 - smoothstep(0, anchor.radius, distance);
    if (influence <= 0) return [0, 0, 0] as const;

    if (anchor.type === 'directional') {
        return [
            Math.cos(anchor.angle) * anchor.strength * influence,
            Math.sin(anchor.angle) * anchor.strength * influence,
            influence,
        ] as const;
    }

    const inverseDistance = distance > 0.0001 ? 1 / distance : 0;
    const directionX = deltaU * inverseDistance;
    const directionY = deltaV * inverseDistance;
    if (anchor.type === 'radial') {
        return [
            directionX * anchor.strength * influence * anchor.polarity,
            directionY * anchor.strength * influence * anchor.polarity,
            influence,
        ] as const;
    }

    return [
        -directionY * anchor.strength * influence * anchor.polarity,
        directionX * anchor.strength * influence * anchor.polarity,
        influence,
    ] as const;
}

function smoothControlPointPositions(
    points: ControlPoint[],
    width: number,
    height: number,
    factor: number,
) {
    for (let pass = 0; pass < 2; pass += 1) {
        const previous = points.map((point) => ({ ...point }));
        const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
        for (let row = 1; row < height - 1; row += 1) {
            for (let column = 1; column < width - 1; column += 1) {
                let averageX = 0;
                let averageY = 0;
                let kernelIndex = 0;
                for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                        const neighbour = previous[(row + offsetY) * width + column + offsetX];
                        const weight = kernel[kernelIndex];
                        averageX += neighbour.x * weight;
                        averageY += neighbour.y * weight;
                        kernelIndex += 1;
                    }
                }
                const point = points[row * width + column];
                point.x = point.x * (1 - factor) + averageX / 16 * factor;
                point.y = point.y * (1 - factor) + averageY / 16 * factor;
            }
        }
    }
}

function enforceControlPointOrder(points: ControlPoint[], width: number, height: number) {
    const minimumXGap = 2 / (width - 1) * MIN_CONTROL_POINT_GAP;
    const minimumYGap = 2 / (height - 1) * MIN_CONTROL_POINT_GAP;

    for (let iteration = 0; iteration < 2; iteration += 1) {
        for (let row = 0; row < height; row += 1) {
            for (let column = 1; column < width - 1; column += 1) {
                const point = points[row * width + column];
                point.x = Math.max(point.x, points[row * width + column - 1].x + minimumXGap);
            }
            for (let column = width - 2; column > 0; column -= 1) {
                const point = points[row * width + column];
                point.x = Math.min(point.x, points[row * width + column + 1].x - minimumXGap);
            }
        }

        for (let column = 0; column < width; column += 1) {
            for (let row = 1; row < height - 1; row += 1) {
                const point = points[row * width + column];
                point.y = Math.max(point.y, points[(row - 1) * width + column].y + minimumYGap);
            }
            for (let row = height - 2; row > 0; row -= 1) {
                const point = points[row * width + column];
                point.y = Math.min(point.y, points[(row + 1) * width + column].y - minimumYGap);
            }
        }
    }
}

function normalizeDegrees(value: number) {
    return ((value + 180) % 360 + 360) % 360 - 180;
}

function applyControlPointTangents(
    points: ControlPoint[],
    activity: number[],
    width: number,
    height: number,
    mode: MeshMode,
    random: RandomSource,
) {
    const uPower = 2 / (width - 1);
    const vPower = 2 / (height - 1);
    const fieldX = randomRange(random, -100, 100);
    const fieldY = randomRange(random, -100, 100);

    for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
            const index = row * width + column;
            const point = points[index];
            const isCorner = (column === 0 || column === width - 1)
                && (row === 0 || row === height - 1);
            if (isCorner) continue;

            const left = points[row * width + Math.max(0, column - 1)];
            const right = points[row * width + Math.min(width - 1, column + 1)];
            const top = points[Math.max(0, row - 1) * width + column];
            const bottom = points[Math.min(height - 1, row + 1) * width + column];
            const uDivisor = column === 0 || column === width - 1 ? 1 : 2;
            const vDivisor = row === 0 || row === height - 1 ? 1 : 2;
            const uX = (right.x - left.x) / uDivisor;
            const uY = (right.y - left.y) / uDivisor;
            const vX = (bottom.x - top.x) / vDivisor;
            const vY = (bottom.y - top.y) / vDivisor;
            const localActivity = clamp(activity[index], 0, 1);
            const fieldU = column / (width - 1) * 1.6 + fieldX;
            const fieldV = row / (height - 1) * 1.6 + fieldY;
            const variation = smoothNoise(fieldU, fieldV);
            const quietThreshold = mode.quietChance * (1 - localActivity * 0.55);
            const deformation = smoothstep(quietThreshold - 0.12, quietThreshold + 0.12, variation);
            const strongThreshold = 1 - mode.strongChance * (0.4 + localActivity * 0.75);
            const strong = smoothstep(strongThreshold - 0.12, strongThreshold + 0.12, variation);
            const rotation = 16 + (mode.strongRotation - 16) * strong;
            const uVariation = smoothNoise(fieldU + 13.7, fieldV - 7.1) * 2 - 1;
            const vVariation = smoothNoise(fieldU - 9.3, fieldV + 19.5) * 2 - 1;

            point.uRotation = Math.atan2(uY, uX) * 180 / Math.PI;
            point.vRotation = normalizeDegrees(Math.atan2(vY, vX) * 180 / Math.PI - 90);
            point.uScale = clamp(Math.hypot(uX, uY) / uPower, 0.55, 1.45);
            point.vScale = clamp(Math.hypot(vX, vY) / vPower, 0.55, 1.45);

            // 连续场控制局部切线扭转与缩放幅度，保持空间过渡平缓。
            point.uRotation = normalizeDegrees((point.uRotation + uVariation * rotation) * deformation);
            point.vRotation = normalizeDegrees((point.vRotation + vVariation * rotation) * deformation);
            const scaleVariation = 0.12 + strong * 0.32;
            point.uScale = clamp(1 + (
                point.uScale * (1 + uVariation * scaleVariation) - 1
            ) * deformation, 0.55, 1.45);
            point.vScale = clamp(1 + (
                point.vScale * (1 + vVariation * scaleVariation) - 1
            ) * deformation, 0.55, 1.45);

            // 边界曲线切向必须贴合画布边缘，避免样条插值时边缘向内收缩露出底色。
            if (row === 0 || row === height - 1) point.uRotation = 0;
            if (column === 0 || column === width - 1) point.vRotation = 0;
        }
    }
}

function smoothControlPointTangents(points: ControlPoint[], width: number, height: number) {
    for (const factor of [0.35, 0.25]) {
        const previous = points.map((point) => ({ ...point }));
        for (let row = 1; row < height - 1; row += 1) {
            for (let column = 1; column < width - 1; column += 1) {
                const index = row * width + column;
                const point = points[index];
                const center = previous[index];
                for (const axis of ['u', 'v'] as const) {
                    const rotation = axis === 'u' ? 'uRotation' : 'vRotation';
                    const scale = axis === 'u' ? 'uScale' : 'vScale';
                    let angleDelta = 0;
                    let scaleDelta = 0;
                    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                            const neighbour = previous[(row + offsetY) * width + column + offsetX];
                            const weight = (offsetX === 0 ? 2 : 1) * (offsetY === 0 ? 2 : 1);
                            angleDelta += normalizeDegrees(neighbour[rotation] - center[rotation]) * weight;
                            scaleDelta += (neighbour[scale] - center[scale]) * weight;
                        }
                    }
                    point[rotation] = normalizeDegrees(center[rotation] + angleDelta / 16 * factor);
                    point[scale] = center[scale] + scaleDelta / 16 * factor;
                }
            }
        }
    }
}

function generateControlPoints(
    width: number,
    height: number,
    mode: MeshMode,
    random: RandomSource,
) {
    const cellWidth = 2 / (width - 1);
    const cellHeight = 2 / (height - 1);
    const anchors = createAnchors(random, mode);
    const noiseFrequency = randomRange(random, 1.1, 1.9);
    const noiseSeedX = randomRange(random, -100, 100);
    const noiseSeedY = randomRange(random, -100, 100);
    const activity = new Array<number>(width * height).fill(0);

    const points = Array.from({ length: width * height }, (_, index): ControlPoint => {
        const column = index % width;
        const row = Math.floor(index / width);
        const u = column / (width - 1);
        const v = row / (height - 1);
        const baseX = u * 2 - 1;
        const baseY = v * 2 - 1;
        const isHorizontalBorder = row === 0 || row === height - 1;
        const isVerticalBorder = column === 0 || column === width - 1;
        const isCorner = isHorizontalBorder && isVerticalBorder;
        if (isCorner) {
            return { x: baseX, y: baseY, uRotation: 0, vRotation: 0, uScale: 1, vScale: 1 };
        }

        let offsetX = 0;
        let offsetY = 0;
        let localActivity = 0;
        for (const anchor of anchors) {
            const [anchorX, anchorY, influence] = anchorOffset(anchor, u, v);
            offsetX += anchorX;
            offsetY += anchorY;
            localActivity = Math.max(localActivity, influence);
        }

        const noiseX = smoothNoise(
            u * noiseFrequency + noiseSeedX,
            v * noiseFrequency + noiseSeedY,
        ) * 2 - 1;
        const noiseY = smoothNoise(
            u * noiseFrequency + noiseSeedY + 17.13,
            v * noiseFrequency + noiseSeedX - 9.71,
        ) * 2 - 1;
        offsetX += noiseX * mode.noise;
        offsetY += noiseY * mode.noise;
        offsetX += randomRange(random, -mode.jitter, mode.jitter);
        offsetY += randomRange(random, -mode.jitter, mode.jitter);
        activity[index] = localActivity;

        if (isHorizontalBorder) {
            offsetX = clamp(
                offsetX + randomRange(random, -mode.borderSlide, mode.borderSlide),
                -MAX_CONTROL_POINT_OFFSET,
                MAX_CONTROL_POINT_OFFSET,
            );
            offsetY = 0;
        } else if (isVerticalBorder) {
            offsetX = 0;
            offsetY = clamp(
                offsetY + randomRange(random, -mode.borderSlide, mode.borderSlide),
                -MAX_CONTROL_POINT_OFFSET,
                MAX_CONTROL_POINT_OFFSET,
            );
        } else {
            offsetX = clamp(offsetX, -MAX_CONTROL_POINT_OFFSET, MAX_CONTROL_POINT_OFFSET);
            offsetY = clamp(offsetY, -MAX_CONTROL_POINT_OFFSET, MAX_CONTROL_POINT_OFFSET);
        }

        return {
            x: baseX + offsetX * cellWidth,
            y: baseY + offsetY * cellHeight,
            uRotation: 0,
            vRotation: 0,
            uScale: 1,
            vScale: 1,
        };
    });

    const smoothingFactor = mode.name === 'calm' ? 0.28 : mode.name === 'balanced' ? 0.22 : 0.18;
    smoothControlPointPositions(points, width, height, smoothingFactor);
    enforceControlPointOrder(points, width, height);
    applyControlPointTangents(points, activity, width, height, mode, random);
    smoothControlPointTangents(points, width, height);
    return points;
}

function hermite(start: number, end: number, startTangent: number, endTangent: number, t: number) {
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * start
        + (t3 - 2 * t2 + t) * startTangent
        + (-2 * t3 + 3 * t2) * end
        + (t3 - t2) * endTangent;
}

function tangent(point: ControlPoint, axis: 'u' | 'v', component: 'x' | 'y', power: number) {
    const rotation = (axis === 'u' ? point.uRotation : point.vRotation) * Math.PI / 180;
    const scale = axis === 'u' ? point.uScale : point.vScale;
    if (axis === 'u') return (component === 'x' ? Math.cos(rotation) : Math.sin(rotation)) * power * scale;
    return (component === 'x' ? -Math.sin(rotation) : Math.cos(rotation)) * power * scale;
}

function prepareControlPoints(points: ControlPoint[], width: number, height: number) {
    const uPower = 2 / (width - 1);
    const vPower = 2 / (height - 1);
    return points.map((controlPoint): PreparedControlPoint => ({
        ...controlPoint,
        uTangentX: tangent(controlPoint, 'u', 'x', uPower),
        uTangentY: tangent(controlPoint, 'u', 'y', uPower),
        vTangentX: tangent(controlPoint, 'v', 'x', vPower),
        vTangentY: tangent(controlPoint, 'v', 'y', vPower),
    }));
}

function samplePatch(
    topLeft: PreparedControlPoint,
    topRight: PreparedControlPoint,
    bottomLeft: PreparedControlPoint,
    bottomRight: PreparedControlPoint,
    subdivisions: number,
    samples: Float64Array,
) {
    const size = subdivisions + 1;
    for (const component of ['x', 'y'] as const) {
        const uTangent = component === 'x' ? 'uTangentX' : 'uTangentY';
        const vTangent = component === 'x' ? 'vTangentX' : 'vTangentY';
        const axis = component === 'x' ? 0 : 1;
        for (let column = 0; column < size; column += 1) {
            const u = column / subdivisions;
            const top = hermite(
                topLeft[component], topRight[component],
                topLeft[uTangent], topRight[uTangent], u,
            );
            const bottom = hermite(
                bottomLeft[component], bottomRight[component],
                bottomLeft[uTangent], bottomRight[uTangent], u,
            );
            const topTangent = hermite(topLeft[vTangent], topRight[vTangent], 0, 0, u);
            const bottomTangent = hermite(bottomLeft[vTangent], bottomRight[vTangent], 0, 0, u);
            for (let row = 0; row < size; row += 1) {
                samples[(row * size + column) * 2 + axis] = hermite(
                    top, bottom, topTangent, bottomTangent, row / subdivisions,
                );
            }
        }
    }
    return samples;
}

function triangleArea(
    samples: Float64Array | Float32Array,
    a: number,
    b: number,
    c: number,
) {
    return (
        (samples[b] - samples[a]) * (samples[c + 1] - samples[a + 1])
        - (samples[b + 1] - samples[a + 1]) * (samples[c] - samples[a])
    ) * 0.5;
}

function scoreControlPoints(
    points: ControlPoint[],
    width: number,
    height: number,
    mode: MeshMode,
) {
    const prepared = prepareControlPoints(points, width, height);
    const coarseSubdivisions = 10;
    const cellWidth = 2 / (width - 1);
    const cellHeight = 2 / (height - 1);
    const baselineArea = cellWidth * cellHeight / (coarseSubdivisions ** 2) * 0.5;
    let triangleCount = 0;
    let invertedCount = 0;
    let compressedCount = 0;
    let expandedCount = 0;
    const patchSamples = new Float64Array((coarseSubdivisions + 1) ** 2 * 2);

    for (let patchY = 0; patchY < height - 1; patchY += 1) {
        for (let patchX = 0; patchX < width - 1; patchX += 1) {
            const topLeft = prepared[patchY * width + patchX];
            const topRight = prepared[patchY * width + patchX + 1];
            const bottomLeft = prepared[(patchY + 1) * width + patchX];
            const bottomRight = prepared[(patchY + 1) * width + patchX + 1];
            const samples = samplePatch(topLeft, topRight, bottomLeft, bottomRight, coarseSubdivisions, patchSamples);
            const sampleRowStride = (coarseSubdivisions + 1) * 2;
            for (let row = 0; row < coarseSubdivisions; row += 1) {
                for (let column = 0; column < coarseSubdivisions; column += 1) {
                    const point00 = row * sampleRowStride + column * 2;
                    const point10 = point00 + 2;
                    const point01 = point00 + sampleRowStride;
                    const point11 = point01 + 2;
                    const areas = [
                        triangleArea(samples, point00, point10, point01),
                        triangleArea(samples, point10, point11, point01),
                    ];
                    for (const area of areas) {
                        triangleCount += 1;
                        if (area <= 0) invertedCount += 1;
                        else if (area < baselineArea * 0.18) compressedCount += 1;
                        else if (area > baselineArea * 4.2) expandedCount += 1;
                    }
                }
            }
        }
    }

    let displacementTotal = 0;
    let interiorPointCount = 0;
    for (let row = 1; row < height - 1; row += 1) {
        for (let column = 1; column < width - 1; column += 1) {
            const point = points[row * width + column];
            const baseX = column / (width - 1) * 2 - 1;
            const baseY = row / (height - 1) * 2 - 1;
            displacementTotal += Math.hypot(
                (point.x - baseX) / cellWidth,
                (point.y - baseY) / cellHeight,
            );
            interiorPointCount += 1;
        }
    }

    const invertedFraction = invertedCount / triangleCount;
    const compressedFraction = compressedCount / triangleCount;
    const expandedFraction = expandedCount / triangleCount;
    const averageDisplacement = displacementTotal / interiorPointCount;
    let score = 100;
    score -= Math.abs(averageDisplacement - mode.targetDisplacement) * 90;
    score -= invertedFraction * 5000;
    score -= compressedFraction * 1500;
    score -= expandedFraction * 120;
    if (invertedCount > 0) score -= mode.name === 'expressive' ? 200 : 500;
    if (invertedFraction > mode.maxInvertedFraction) score -= 1000;
    return score;
}

function selectControlPoints(
    width: number,
    height: number,
    mode: MeshMode,
    random: RandomSource,
    candidateCount = CANDIDATE_COUNT,
) {
    let bestCandidate: ControlPointCandidate | null = null;
    for (let index = 0; index < candidateCount; index += 1) {
        const points = generateControlPoints(width, height, mode, random);
        const score = scoreControlPoints(points, width, height, mode);
        if (!bestCandidate || score > bestCandidate.score) {
            bestCandidate = { points, score };
        }
    }
    if (!bestCandidate) throw new Error('无法生成随机网格控制点');
    return bestCandidate.points;
}

function sampleControlPointsToPositions(
    points: ControlPoint[],
    controlWidth: number,
    controlHeight: number,
    subdivisions: number,
    target: Float32Array,
) {
    const columns = (controlWidth - 1) * subdivisions + 1;
    const prepared = prepareControlPoints(points, controlWidth, controlHeight);
    const patchSamples = new Float64Array((subdivisions + 1) ** 2 * 2);
    for (let patchY = 0; patchY < controlHeight - 1; patchY += 1) {
        for (let patchX = 0; patchX < controlWidth - 1; patchX += 1) {
            const corner = patchY * controlWidth + patchX;
            const samples = samplePatch(
                prepared[corner],
                prepared[corner + 1],
                prepared[corner + controlWidth],
                prepared[corner + controlWidth + 1],
                subdivisions,
                patchSamples,
            );
            for (let localRow = 0; localRow <= subdivisions; localRow += 1) {
                const row = patchY * subdivisions + localRow;
                for (let localColumn = 0; localColumn <= subdivisions; localColumn += 1) {
                    const column = patchX * subdivisions + localColumn;
                    const sampleOffset = (localRow * (subdivisions + 1) + localColumn) * 2;
                    const vertexOffset = (row * columns + column) * 2;
                    target[vertexOffset] = samples[sampleOffset];
                    target[vertexOffset + 1] = samples[sampleOffset + 1];
                }
            }
        }
    }
}

function createBasePositions(columns: number, rows: number) {
    const base = new Float32Array(columns * rows * 2);
    for (let row = 0; row < rows; row += 1) {
        const y = row / (rows - 1) * 2 - 1;
        for (let column = 0; column < columns; column += 1) {
            const x = column / (columns - 1) * 2 - 1;
            const offset = (row * columns + column) * 2;
            base[offset] = x;
            base[offset + 1] = y;
        }
    }
    return base;
}

function createUvs(columns: number, rows: number) {
    const uvs = new Float32Array(columns * rows * 2);
    for (let row = 0; row < rows; row += 1) {
        const v = 1 - row / (rows - 1);
        for (let column = 0; column < columns; column += 1) {
            const u = column / (columns - 1);
            const offset = (row * columns + column) * 2;
            uvs[offset] = u;
            uvs[offset + 1] = v;
        }
    }

    return uvs;
}

function createIndices(columns: number, rows: number) {
    const indices = new Uint16Array((columns - 1) * (rows - 1) * 6);
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
    return indices;
}

function hasValidLinearPairTopology(
    fromPositions: Float32Array,
    toPositions: Float32Array,
    indices: Uint16Array,
    minimumArea: number,
) {
    for (let index = 0; index < indices.length; index += 3) {
        const a = indices[index] * 2;
        const b = indices[index + 1] * 2;
        const c = indices[index + 2] * 2;
        const abX = fromPositions[b] - fromPositions[a];
        const abY = fromPositions[b + 1] - fromPositions[a + 1];
        const acX = fromPositions[c] - fromPositions[a];
        const acY = fromPositions[c + 1] - fromPositions[a + 1];
        const toAbX = toPositions[b] - toPositions[a];
        const toAbY = toPositions[b + 1] - toPositions[a + 1];
        const toAcX = toPositions[c] - toPositions[a];
        const toAcY = toPositions[c + 1] - toPositions[a + 1];
        const fromArea = abX * acY - abY * acX;
        const toArea = toAbX * toAcY - toAbY * toAcX;
        if (Math.min(fromArea, toArea) <= minimumArea) return false;

        const deltaAbX = toAbX - abX;
        const deltaAbY = toAbY - abY;
        const deltaAcX = toAcX - acX;
        const deltaAcY = toAcY - acY;
        const quadratic = deltaAbX * deltaAcY - deltaAbY * deltaAcX;
        const linear = abX * deltaAcY + deltaAbX * acY - abY * deltaAcX - deltaAbY * acX;
        if (quadratic > 0) {
            const minimumMix = -linear / (2 * quadratic);
            if (
                minimumMix > 0
                && minimumMix < 1
                && fromArea + linear * minimumMix + quadratic * minimumMix ** 2 <= minimumArea
            ) {
                return false;
            }
        }
    }
    return true;
}

const SPLINE_VALIDATION_SAMPLES = [0.2, 0.4, 0.6, 0.8] as const;

function hasValidSplineSegmentTopology(
    p0: Float32Array,
    p1: Float32Array,
    p2: Float32Array,
    p3: Float32Array,
    indices: Uint16Array,
    minimumArea: number,
    tension: number,
    columns: number,
) {
    // 索引按网格行顺序排列；两行缓存让共享顶点只插值一次，保留双精度校验结果。
    const rowStride = columns * 2;
    const positions = new Float64Array(rowStride * 2);
    const rowIndexCount = (columns - 1) * 6;
    for (const sampleT of SPLINE_VALIDATION_SAMPLES) {
        const [w0, w1, w2, w3] = catmullRomWeights(sampleT, tension);
        for (let rowIndex = 0; rowIndex < indices.length; rowIndex += rowIndexCount) {
            const rowOffset = rowIndex / rowIndexCount * rowStride;
            if (rowIndex > 0) positions.copyWithin(0, rowStride);
            const firstOffset = rowIndex === 0 ? 0 : rowStride;
            for (let offset = firstOffset; offset < positions.length; offset += 1) {
                const vertex = rowOffset + offset;
                positions[offset] = p0[vertex] * w0
                    + p1[vertex] * w1 + p2[vertex] * w2 + p3[vertex] * w3;
            }
            for (let index = rowIndex; index < rowIndex + rowIndexCount; index += 3) {
                const a = indices[index] * 2 - rowOffset;
                const b = indices[index + 1] * 2 - rowOffset;
                const c = indices[index + 2] * 2 - rowOffset;
                const area = (positions[b] - positions[a]) * (positions[c + 1] - positions[a + 1])
                    - (positions[b + 1] - positions[a + 1]) * (positions[c] - positions[a]);
                if (area <= minimumArea) return false;
            }
        }
    }
    return true;
}

function blendPositionsToward(target: Float32Array, anchor: Float32Array, retainFactor: number) {
    const anchorFactor = 1 - retainFactor;
    for (let offset = 0; offset < target.length; offset += 1) {
        target[offset] = anchor[offset] * anchorFactor + target[offset] * retainFactor;
    }
}

function constrainNextKeyframe(
    p1: Float32Array,
    p2: Float32Array,
    p3: Float32Array,
    nextPositions: Float32Array,
    basePositions: Float32Array,
    indices: Uint16Array,
    minimumArea: number,
    tension: number,
    columns: number,
) {
    // 先保证新目标自身及 P3 -> P4 线性过渡具备充足安全裕量，再检验 P2 -> P3 的四点样条段。
    const linearMarginArea = minimumArea * 1.4;
    let guard = 0;
    while (
        !hasValidLinearPairTopology(p3, nextPositions, indices, linearMarginArea)
        && guard < 8
    ) {
        blendPositionsToward(nextPositions, basePositions, 0.65);
        guard += 1;
    }
    if (guard >= 8) {
        nextPositions.set(basePositions);
    }

    guard = 0;
    while (
        !hasValidSplineSegmentTopology(p1, p2, p3, nextPositions, indices, minimumArea, tension, columns)
        && guard < 8
    ) {
        // P4 仅通过末端切线 tau * (P4 - P2) 影响 P2 -> P3 段，向 P2 收敛可平滑减小末端切线而不触碰已锁定节点。
        blendPositionsToward(nextPositions, p2, 0.6);
        guard += 1;
    }
}

type PreparationStage = 'candidate' | 'sample' | 'validate' | 'ready';

export class MeshSplineGenerator {
    readonly controlWidth: number;
    readonly controlHeight: number;
    readonly subdivisions: number;
    readonly columns: number;
    readonly rows: number;
    readonly indices: Uint16Array;

    private readonly random: RandomSource;
    private readonly basePositions: Float32Array;
    private readonly minimumArea: number;
    private tension: number;
    private keyframes: [Float32Array, Float32Array, Float32Array, Float32Array];
    private standbyPositions: Float32Array;
    private stage: PreparationStage = 'candidate';
    private pendingMode: MeshMode;
    private evaluatedCandidates = 0;
    private bestCandidate: ControlPointCandidate | null = null;

    constructor(
        controlWidth = DEFAULT_CONTROL_SIZE,
        controlHeight = DEFAULT_CONTROL_SIZE,
        subdivisions = 50,
        tension = DEFAULT_SPLINE_TENSION,
    ) {
        this.controlWidth = controlWidth;
        this.controlHeight = controlHeight;
        this.subdivisions = subdivisions;
        this.tension = clamp(tension, 0, 1);
        this.columns = (controlWidth - 1) * subdivisions + 1;
        this.rows = (controlHeight - 1) * subdivisions + 1;
        if (this.columns * this.rows > 0x10000) {
            throw new Error('随机网格顶点数量超过 Uint16 索引上限');
        }

        const seed = Math.floor(Math.random() * 0x100000000);
        this.random = createRandom(seed);
        this.basePositions = createBasePositions(this.columns, this.rows);
        this.indices = createIndices(this.columns, this.rows);
        this.minimumArea = 4 / ((this.columns - 1) * (this.rows - 1)) * 0.05;

        const vertexFloats = this.columns * this.rows * 2;
        const p0 = new Float32Array(vertexFloats);
        const p1 = new Float32Array(vertexFloats);
        const p2 = new Float32Array(vertexFloats);
        const p3 = new Float32Array(vertexFloats);
        this.standbyPositions = new Float32Array(vertexFloats);

        this.sampleInitialKeyframe(p0);
        this.sampleInitialKeyframe(p1, p0);
        this.sampleInitialKeyframe(p2, p1);
        this.sampleInitialKeyframe(p3, p2);
        constrainNextKeyframe(p0, p1, p2, p3, this.basePositions, this.indices, this.minimumArea, this.tension, this.columns);
        let initGuard = 0;
        while (
            !hasValidSplineSegmentTopology(p0, p1, p2, p3, this.indices, this.minimumArea, this.tension, this.columns)
            && initGuard < 8
        ) {
            for (const keyframe of [p0, p1, p2, p3]) {
                blendPositionsToward(keyframe, this.basePositions, 0.65);
            }
            initGuard += 1;
        }

        this.keyframes = [p0, p1, p2, p3];
        this.pendingMode = chooseMode(this.random);
    }

    private sampleInitialKeyframe(target: Float32Array, previous?: Float32Array) {
        const mode = chooseMode(this.random);
        const points = selectControlPoints(
            this.controlWidth,
            this.controlHeight,
            mode,
            this.random,
            INITIAL_CANDIDATE_COUNT,
        );
        sampleControlPointsToPositions(
            points,
            this.controlWidth,
            this.controlHeight,
            this.subdivisions,
            target,
        );
        const reference = previous ?? this.basePositions;
        const linearMarginArea = this.minimumArea * 1.4;
        let guard = 0;
        while (
            !hasValidLinearPairTopology(reference, target, this.indices, linearMarginArea)
            && guard < 8
        ) {
            blendPositionsToward(target, this.basePositions, 0.65);
            guard += 1;
        }
    }

    createUvs() {
        return createUvs(this.columns, this.rows);
    }

    getTension() {
        return this.tension;
    }

    setTension(tension: number) {
        this.tension = clamp(tension, 0, 1);
    }

    getKeyframes(): readonly [Float32Array, Float32Array, Float32Array, Float32Array] {
        return this.keyframes;
    }

    getStandbyPositions() {
        return this.standbyPositions;
    }

    isStandbyReady() {
        return this.stage === 'ready';
    }

    /**
     * 将下一目标网格的生成、采样与拓扑检查分摊到多帧执行，避免换段时集中计算。
     */
    stepPreparation() {
        if (this.stage === 'ready') return true;

        if (this.stage === 'candidate') {
            const batchEnd = Math.min(CANDIDATE_COUNT, this.evaluatedCandidates + CANDIDATES_PER_STEP);
            while (this.evaluatedCandidates < batchEnd) {
                const points = generateControlPoints(
                    this.controlWidth,
                    this.controlHeight,
                    this.pendingMode,
                    this.random,
                );
                const score = scoreControlPoints(
                    points,
                    this.controlWidth,
                    this.controlHeight,
                    this.pendingMode,
                );
                if (!this.bestCandidate || score > this.bestCandidate.score) {
                    this.bestCandidate = { points, score };
                }
                this.evaluatedCandidates += 1;
            }
            if (this.evaluatedCandidates >= CANDIDATE_COUNT) {
                this.stage = 'sample';
            }
            return false;
        }

        if (this.stage === 'sample') {
            if (!this.bestCandidate) {
                this.evaluatedCandidates = 0;
                this.stage = 'candidate';
                return false;
            }
            sampleControlPointsToPositions(
                this.bestCandidate.points,
                this.controlWidth,
                this.controlHeight,
                this.subdivisions,
                this.standbyPositions,
            );
            this.stage = 'validate';
            return false;
        }

        constrainNextKeyframe(
            this.keyframes[1],
            this.keyframes[2],
            this.keyframes[3],
            this.standbyPositions,
            this.basePositions,
            this.indices,
            this.minimumArea,
            this.tension,
            this.columns,
        );
        this.stage = 'ready';
        return true;
    }

    finishPreparationNow() {
        while (!this.stepPreparation()) {
            // 同步补完剩余步骤。
        }
    }

    /**
     * 在段交接处切换滑动窗口 (P0, P1, P2, P3) <- (P1, P2, P3, P_standby)，并重置下一轮预生成状态。
     */
    advanceSegment() {
        this.finishPreparationNow();
        const [recycled, p1, p2, p3] = this.keyframes;
        this.keyframes = [p1, p2, p3, this.standbyPositions];
        this.standbyPositions = recycled;
        this.stage = 'candidate';
        this.pendingMode = chooseMode(this.random);
        this.evaluatedCandidates = 0;
        this.bestCandidate = null;
    }
}
