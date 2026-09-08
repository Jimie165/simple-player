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

            point.uRotation = Math.atan2(uY, uX) * 180 / Math.PI;
            point.vRotation = normalizeDegrees(Math.atan2(vY, vX) * 180 / Math.PI - 90);
            point.uScale = clamp(Math.hypot(uX, uY) / uPower, 0.35, 2.2);
            point.vScale = clamp(Math.hypot(vX, vY) / vPower, 0.35, 2.2);

            if (random() < mode.quietChance * (1 - localActivity * 0.65)) {
                point.uRotation = 0;
                point.vRotation = 0;
                point.uScale = 1;
                point.vScale = 1;
            } else if (random() < mode.strongChance * (0.45 + localActivity * 0.85)) {
                point.uRotation = normalizeDegrees(
                    point.uRotation + randomRange(random, -mode.strongRotation, mode.strongRotation),
                );
                point.vRotation = normalizeDegrees(
                    point.vRotation + randomRange(random, -mode.strongRotation, mode.strongRotation),
                );
                const scaleMinimum = mode.name === 'expressive' ? 0.38 : 0.5;
                const scaleMaximum = mode.name === 'expressive' ? 2 : 1.7;
                point.uScale = clamp(
                    point.uScale * randomRange(random, scaleMinimum, scaleMaximum),
                    0.3,
                    2.2,
                );
                point.vScale = clamp(
                    point.vScale * randomRange(random, scaleMinimum, scaleMaximum),
                    0.3,
                    2.2,
                );
            } else {
                point.uRotation = normalizeDegrees(
                    point.uRotation + randomRange(random, -22, 22),
                );
                point.vRotation = normalizeDegrees(
                    point.vRotation + randomRange(random, -22, 22),
                );
                point.uScale = clamp(point.uScale * randomRange(random, 0.85, 1.18), 0.4, 1.8);
                point.vScale = clamp(point.vScale * randomRange(random, 0.85, 1.18), 0.4, 1.8);
            }

            // 边界曲线的切向方向必须贴着画布边缘，否则 Hermite 曲线会向内弯并露出底色。
            if (row === 0 || row === height - 1) point.uRotation = 0;
            if (column === 0 || column === width - 1) point.vRotation = 0;
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

function evaluatePatch(
    topLeft: PreparedControlPoint,
    topRight: PreparedControlPoint,
    bottomLeft: PreparedControlPoint,
    bottomRight: PreparedControlPoint,
    u: number,
    v: number,
) {
    const evaluate = (component: 'x' | 'y') => {
        const uTangent = component === 'x' ? 'uTangentX' : 'uTangentY';
        const vTangent = component === 'x' ? 'vTangentX' : 'vTangentY';
        const top = hermite(
            topLeft[component], topRight[component],
            topLeft[uTangent], topRight[uTangent], u,
        );
        const bottom = hermite(
            bottomLeft[component], bottomRight[component],
            bottomLeft[uTangent], bottomRight[uTangent], u,
        );
        const topTangent = hermite(
            topLeft[vTangent], topRight[vTangent], 0, 0, u,
        );
        const bottomTangent = hermite(
            bottomLeft[vTangent], bottomRight[vTangent], 0, 0, u,
        );
        return hermite(top, bottom, topTangent, bottomTangent, v);
    };
    return [evaluate('x'), evaluate('y')] as const;
}

function triangleArea(
    pointA: readonly [number, number],
    pointB: readonly [number, number],
    pointC: readonly [number, number],
) {
    return (
        (pointB[0] - pointA[0]) * (pointC[1] - pointA[1])
        - (pointB[1] - pointA[1]) * (pointC[0] - pointA[0])
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
            for (let row = 0; row < coarseSubdivisions; row += 1) {
                const v0 = row / coarseSubdivisions;
                const v1 = (row + 1) / coarseSubdivisions;
                for (let column = 0; column < coarseSubdivisions; column += 1) {
                    const u0 = column / coarseSubdivisions;
                    const u1 = (column + 1) / coarseSubdivisions;
                    const point00 = evaluatePatch(
                        topLeft, topRight, bottomLeft, bottomRight, u0, v0,
                    );
                    const point10 = evaluatePatch(
                        topLeft, topRight, bottomLeft, bottomRight, u1, v0,
                    );
                    const point01 = evaluatePatch(
                        topLeft, topRight, bottomLeft, bottomRight, u0, v1,
                    );
                    const point11 = evaluatePatch(
                        topLeft, topRight, bottomLeft, bottomRight, u1, v1,
                    );
                    const areas = [
                        triangleArea(point00, point10, point01),
                        triangleArea(point10, point11, point01),
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
    const columns = (controlWidth - 1) * subdivisions + 1;
    const rows = (controlHeight - 1) * subdivisions + 1;
    if (columns * rows > 0x10000) {
        throw new Error('随机网格顶点数量超过 Uint16 索引上限');
    }
    const vertices = new Float32Array(columns * rows * 4);
    const indices = new Uint16Array((columns - 1) * (rows - 1) * 6);
    const preparedPoints = prepareControlPoints(
        controlPoints,
        controlWidth,
        controlHeight,
    );
    let vertexOffset = 0;
    for (let row = 0; row < rows; row += 1) {
        const gridV = row / subdivisions;
        const patchY = Math.min(controlHeight - 2, Math.floor(gridV));
        const v = Math.min(1, gridV - patchY);
        for (let column = 0; column < columns; column += 1) {
            const gridU = column / subdivisions;
            const patchX = Math.min(controlWidth - 2, Math.floor(gridU));
            const u = Math.min(1, gridU - patchX);
            const topLeft = preparedPoints[patchY * controlWidth + patchX];
            const topRight = preparedPoints[patchY * controlWidth + patchX + 1];
            const bottomLeft = preparedPoints[(patchY + 1) * controlWidth + patchX];
            const bottomRight = preparedPoints[(patchY + 1) * controlWidth + patchX + 1];
            const [x, y] = evaluatePatch(
                topLeft, topRight, bottomLeft, bottomRight, u, v,
            );
            vertices[vertexOffset] = x;
            vertices[vertexOffset + 1] = y;
            vertices[vertexOffset + 2] = column / (columns - 1);
            vertices[vertexOffset + 3] = row / (rows - 1);
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
