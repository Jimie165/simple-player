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
        anchorRadius: [0.38, 0.68],
        anchorStrength: [0.2, 0.42],
        jitter: 0.06,
        noise: 0.08,
        borderSlide: 0.25,
        quietChance: 0.68,
        strongChance: 0.07,
        strongRotation: 42,
        targetDisplacement: 0.2,
        maxInvertedFraction: 0,
    },
    balanced: {
        name: 'balanced',
        anchorCount: [2, 3],
        anchorRadius: [0.3, 0.58],
        anchorStrength: [0.3, 0.64],
        jitter: 0.08,
        noise: 0.12,
        borderSlide: 0.4,
        quietChance: 0.55,
        strongChance: 0.17,
        strongRotation: 58,
        targetDisplacement: 0.3,
        maxInvertedFraction: 0.001,
    },
    expressive: {
        name: 'expressive',
        anchorCount: [3, 4],
        anchorRadius: [0.24, 0.5],
        anchorStrength: [0.44, 0.86],
        jitter: 0.1,
        noise: 0.16,
        borderSlide: 0.58,
        quietChance: 0.42,
        strongChance: 0.28,
        strongRotation: 72,
        targetDisplacement: 0.4,
        maxInvertedFraction: 0.003,
    },
};

const CANDIDATE_COUNT = 8;
const MIN_CONTROL_POINT_GAP = 0.25;
const MORPH_PERIOD_MS = 10_000;

export function meshMorphMix(elapsedMilliseconds: number) {
    const cycle = Math.max(0, elapsedMilliseconds) % MORPH_PERIOD_MS / MORPH_PERIOD_MS;
    const phase = 1 - Math.abs(cycle * 2 - 1);
    return phase * phase * (3 - 2 * phase);
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
    if (value < 0.3) return MESH_MODES.calm;
    if (value < 0.8) return MESH_MODES.balanced;
    return MESH_MODES.expressive;
}

function chooseGridSize(random: RandomSource, mode: MeshMode) {
    if (mode.name === 'calm') return random() < 0.7 ? 4 : 5;
    if (mode.name === 'balanced') return 5;
    return random() < 0.25 ? 5 : 6;
}

function createAnchors(random: RandomSource, mode: MeshMode): DeformationAnchor[] {
    const count = randomInteger(random, mode.anchorCount[0], mode.anchorCount[1]);
    return Array.from({ length: count }, () => ({
        u: randomRange(random, 0.12, 0.88),
        v: randomRange(random, 0.12, 0.88),
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
            const fieldU = column / (width - 1) * 2 + fieldX;
            const fieldV = row / (height - 1) * 2 + fieldY;
            const variation = smoothNoise(fieldU, fieldV);
            const quietThreshold = mode.quietChance * (1 - localActivity * 0.65);
            const deformation = smoothstep(quietThreshold - 0.1, quietThreshold + 0.1, variation);
            const strongThreshold = 1 - mode.strongChance * (0.45 + localActivity * 0.85);
            const strong = smoothstep(strongThreshold - 0.1, strongThreshold + 0.1, variation);
            const rotation = 22 + (mode.strongRotation - 22) * strong;
            const uVariation = smoothNoise(fieldU + 13.7, fieldV - 7.1) * 2 - 1;
            const vVariation = smoothNoise(fieldU - 9.3, fieldV + 19.5) * 2 - 1;

            point.uRotation = Math.atan2(uY, uX) * 180 / Math.PI;
            point.vRotation = normalizeDegrees(Math.atan2(vY, vX) * 180 / Math.PI - 90);
            point.uScale = clamp(Math.hypot(uX, uY) / uPower, 0.35, 2.2);
            point.vScale = clamp(Math.hypot(vX, vY) / vPower, 0.35, 2.2);

            // 连续场决定整片区域的安静/拉伸程度，避免逐点抽签产生互相冲突的切线。
            point.uRotation = normalizeDegrees((point.uRotation + uVariation * rotation) * deformation);
            point.vRotation = normalizeDegrees((point.vRotation + vVariation * rotation) * deformation);
            const scaleVariation = 0.18 + strong * 0.65;
            point.uScale = clamp(1 + (
                point.uScale * (1 + uVariation * scaleVariation) - 1
            ) * deformation, 0.3, 2.2);
            point.vScale = clamp(1 + (
                point.vScale * (1 + vVariation * scaleVariation) - 1
            ) * deformation, 0.3, 2.2);

            // 边界曲线的切向方向必须贴着画布边缘，否则 Hermite 曲线会向内弯并露出底色。
            if (row === 0 || row === height - 1) point.uRotation = 0;
            if (column === 0 || column === width - 1) point.vRotation = 0;
        }
    }
}

function smoothControlPointTangents(points: ControlPoint[], width: number, height: number) {
    // 只在换封面时平滑；保留固定边界，且角度通过最短角差插值。
    for (const factor of [0.3, 0.2]) {
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
    // 少量局部锚点负责主要构图，连续噪声只补充细节，避免每个点平均随机。
    const cellWidth = 2 / (width - 1);
    const cellHeight = 2 / (height - 1);
    const anchors = createAnchors(random, mode);
    const noiseFrequency = randomRange(random, 1.2, 2.4);
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
            offsetX += randomRange(random, -mode.borderSlide, mode.borderSlide);
            offsetY = 0;
        } else if (isVerticalBorder) {
            offsetX = 0;
            offsetY += randomRange(random, -mode.borderSlide, mode.borderSlide);
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

    const smoothingFactor = mode.name === 'calm' ? 0.2 : mode.name === 'balanced' ? 0.15 : 0.1;
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
) {
    const size = subdivisions + 1;
    const samples = new Float64Array(size * size * 2);
    // 同一列共享横向插值，只计算一次；双精度保持候选评分与原公式一致。
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
    samples: Float64Array,
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

    for (let patchY = 0; patchY < height - 1; patchY += 1) {
        for (let patchX = 0; patchX < width - 1; patchX += 1) {
            const topLeft = prepared[patchY * width + patchX];
            const topRight = prepared[patchY * width + patchX + 1];
            const bottomLeft = prepared[(patchY + 1) * width + patchX];
            const bottomRight = prepared[(patchY + 1) * width + patchX + 1];
            const samples = samplePatch(topLeft, topRight, bottomLeft, bottomRight, coarseSubdivisions);
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
                        else if (area < baselineArea * 0.15) compressedCount += 1;
                        else if (area > baselineArea * 5) expandedCount += 1;
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
    if (invertedCount > 0) score -= mode.name === 'expressive' ? 150 : 500;
    if (invertedFraction > mode.maxInvertedFraction) score -= 1000;
    return score;
}

function selectControlPoints(
    width: number,
    height: number,
    mode: MeshMode,
    random: RandomSource,
) {
    // 先对低成本的粗曲面评分，只细分质量最好的候选。
    let bestCandidate: ControlPointCandidate | null = null;
    for (let index = 0; index < CANDIDATE_COUNT; index += 1) {
        const points = generateControlPoints(width, height, mode, random);
        const score = scoreControlPoints(points, width, height, mode);
        if (!bestCandidate || score > bestCandidate.score) {
            bestCandidate = { points, score };
        }
    }
    if (!bestCandidate) throw new Error('无法生成随机网格控制点');
    return bestCandidate.points;
}

function hasValidMorphTopology(vertices: Float32Array, indices: Uint16Array, minimumArea: number) {
    for (let index = 0; index < indices.length; index += 3) {
        const a = indices[index] * 6;
        const b = indices[index + 1] * 6;
        const c = indices[index + 2] * 6;
        const abX = vertices[b] - vertices[a];
        const abY = vertices[b + 1] - vertices[a + 1];
        const acX = vertices[c] - vertices[a];
        const acY = vertices[c + 1] - vertices[a + 1];
        const toAbX = vertices[b + 2] - vertices[a + 2];
        const toAbY = vertices[b + 3] - vertices[a + 3];
        const toAcX = vertices[c + 2] - vertices[a + 2];
        const toAcY = vertices[c + 3] - vertices[a + 3];
        const fromArea = abX * acY - abY * acX;
        const toArea = toAbX * toAcY - toAbY * toAcX;
        if (Math.min(fromArea, toArea) <= minimumArea) return false;

        const deltaAbX = toAbX - abX;
        const deltaAbY = toAbY - abY;
        const deltaAcX = toAcX - acX;
        const deltaAcY = toAcY - acY;
        // 三角形面积随插值量呈二次变化；两端有效仍可能在途中翻转。
        const quadratic = deltaAbX * deltaAcY - deltaAbY * deltaAcX;
        const linear = abX * deltaAcY + deltaAbX * acY - abY * deltaAcX - deltaAbY * acX;
        if (quadratic > 0) {
            const minimumMix = -linear / (2 * quadratic);
            if (minimumMix > 0 && minimumMix < 1
                && fromArea + linear * minimumMix + quadratic * minimumMix ** 2 <= minimumArea) {
                return false;
            }
        }
    }
    return true;
}

function constrainMorphTopology(vertices: Float32Array, indices: Uint16Array, minimumArea: number) {
    // 只在生成时收敛异常网格；两端同时靠近规则网格，保留整体运动和固定边界。
    while (!hasValidMorphTopology(vertices, indices, minimumArea)) {
        for (let offset = 0; offset < vertices.length; offset += 6) {
            const baseX = vertices[offset + 4] * 2 - 1;
            const baseY = 1 - vertices[offset + 5] * 2;
            for (const endpoint of [0, 2]) {
                vertices[offset + endpoint] = baseX + (vertices[offset + endpoint] - baseX) * 0.5;
                vertices[offset + endpoint + 1] = baseY + (vertices[offset + endpoint + 1] - baseY) * 0.5;
            }
        }
    }
}

export function createMesh(
    requestedControlWidth?: number,
    requestedControlHeight?: number,
    subdivisions = 50,
) {
    const seed = Math.floor(Math.random() * 0x100000000);
    const random = createRandom(seed);
    const mode = chooseMode(random);
    const defaultSize = chooseGridSize(random, mode);
    const controlWidth = requestedControlWidth ?? defaultSize;
    const controlHeight = requestedControlHeight ?? defaultSize;
    const controlPoints = selectControlPoints(
        controlWidth,
        controlHeight,
        mode,
        random,
    );
    const morphControlPoints = selectControlPoints(
        controlWidth,
        controlHeight,
        mode,
        random,
    );
    const columns = (controlWidth - 1) * subdivisions + 1;
    const rows = (controlHeight - 1) * subdivisions + 1;
    if (columns * rows > 0x10000) {
        throw new Error('随机网格顶点数量超过 Uint16 索引上限');
    }
    // Both endpoints share one static buffer and identical UVs/topology.
    const vertices = new Float32Array(columns * rows * 6);
    const indices = new Uint16Array((columns - 1) * (rows - 1) * 6);
    const preparedPoints = prepareControlPoints(
        controlPoints,
        controlWidth,
        controlHeight,
    );
    const preparedMorphPoints = prepareControlPoints(
        morphControlPoints,
        controlWidth,
        controlHeight,
    );
    for (let patchY = 0; patchY < controlHeight - 1; patchY += 1) {
        for (let patchX = 0; patchX < controlWidth - 1; patchX += 1) {
            const corner = patchY * controlWidth + patchX;
            const from = samplePatch(
                preparedPoints[corner], preparedPoints[corner + 1],
                preparedPoints[corner + controlWidth], preparedPoints[corner + controlWidth + 1],
                subdivisions,
            );
            const to = samplePatch(
                preparedMorphPoints[corner], preparedMorphPoints[corner + 1],
                preparedMorphPoints[corner + controlWidth], preparedMorphPoints[corner + controlWidth + 1],
                subdivisions,
            );
            for (let localRow = 0; localRow <= subdivisions; localRow += 1) {
                const row = patchY * subdivisions + localRow;
                for (let localColumn = 0; localColumn <= subdivisions; localColumn += 1) {
                    const column = patchX * subdivisions + localColumn;
                    const sampleOffset = (localRow * (subdivisions + 1) + localColumn) * 2;
                    const vertexOffset = (row * columns + column) * 6;
                    vertices[vertexOffset] = from[sampleOffset];
                    vertices[vertexOffset + 1] = from[sampleOffset + 1];
                    vertices[vertexOffset + 2] = to[sampleOffset];
                    vertices[vertexOffset + 3] = to[sampleOffset + 1];
                    vertices[vertexOffset + 4] = column / (columns - 1);
                    // 封面上传时不翻转；画布顶端对应纹理 v = 0。
                    vertices[vertexOffset + 5] = 1 - row / (rows - 1);
                }
            }
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
    constrainMorphTopology(vertices, indices, 4 / ((columns - 1) * (rows - 1)) * 0.05);
    return { vertices, indices };
}
