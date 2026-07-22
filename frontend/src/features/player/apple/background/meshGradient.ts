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

const randomRange = (minimum: number, maximum: number) => (
    minimum + Math.random() * (maximum - minimum)
);

function smoothstep(edge0: number, edge1: number, value: number) {
    const normalized = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
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

function noiseGradient(x: number, y: number) {
    const epsilon = 0.001;
    const dx = (smoothNoise(x + epsilon, y) - smoothNoise(x - epsilon, y)) / (2 * epsilon);
    const dy = (smoothNoise(x, y + epsilon) - smoothNoise(x, y - epsilon)) / (2 * epsilon);
    const length = Math.hypot(dx, dy) || 1;
    return [dx / length, dy / length] as const;
}

function generateControlPoints(width = 6, height = 6) {
    const variation = randomRange(0.4, 0.6);
    const normalOffset = randomRange(0.3, 0.6);
    const cellWidth = 2 / (width - 1);
    const cellHeight = 2 / (height - 1);
    let points = Array.from({ length: width * height }, (_, index): ControlPoint => {
        const column = index % width;
        const row = Math.floor(index / width);
        const baseX = column / (width - 1) * 2 - 1;
        const baseY = row / (height - 1) * 2 - 1;
        const isBorder = column === 0 || column === width - 1 || row === 0 || row === height - 1;
        if (isBorder) {
            return { x: baseX, y: baseY, uRotation: 0, vRotation: 0, uScale: 1, vScale: 1 };
        }

        const [gradientX, gradientY] = noiseGradient(
            (baseX + 1) * 0.5,
            (baseY + 1) * 0.5,
        );
        const borderDistance = Math.min(
            column / (width - 1),
            1 - column / (width - 1),
            row / (height - 1),
            1 - row / (height - 1),
        );
        const normalWeight = smoothstep(0, 1, borderDistance) * normalOffset * 0.8;
        return {
            x: baseX + randomRange(-variation, variation) * cellWidth + gradientX * normalWeight,
            y: baseY + randomRange(-variation, variation) * cellHeight + gradientY * normalWeight,
            uRotation: randomRange(-60, 60),
            vRotation: randomRange(-60, 60),
            uScale: randomRange(0.8, 1.2),
            vScale: randomRange(0.8, 1.2),
        };
    });

    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    const iterations = Math.floor(randomRange(3, 5));
    let factor = randomRange(0.2, 0.3);
    const factorModifier = randomRange(-0.1, -0.05);
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const previous = points;
        points = previous.map((current, index) => {
            const column = index % width;
            const row = Math.floor(index / width);
            const isBorder = column === 0 || column === width - 1 || row === 0 || row === height - 1;
            if (isBorder) return current;
            const average: ControlPoint = {
                x: 0, y: 0, uRotation: 0, vRotation: 0, uScale: 0, vScale: 0,
            };
            let kernelIndex = 0;
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                    const neighbour = previous[index + offsetY * width + offsetX];
                    const weight = kernel[kernelIndex];
                    average.x += neighbour.x * weight;
                    average.y += neighbour.y * weight;
                    average.uRotation += neighbour.uRotation * weight;
                    average.vRotation += neighbour.vRotation * weight;
                    average.uScale += neighbour.uScale * weight;
                    average.vScale += neighbour.vScale * weight;
                    kernelIndex += 1;
                }
            }
            const blend = (value: number, target: number) => value * (1 - factor) + target / 16 * factor;
            return {
                x: blend(current.x, average.x),
                y: blend(current.y, average.y),
                uRotation: blend(current.uRotation, average.uRotation),
                vRotation: blend(current.vRotation, average.vRotation),
                uScale: blend(current.uScale, average.uScale),
                vScale: blend(current.vScale, average.vScale),
            };
        });
        factor = Math.min(1, Math.max(0, factor + factorModifier));
    }
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

export function createMesh(controlWidth = 6, controlHeight = 6, subdivisions = 50) {
    const controlPoints = generateControlPoints(controlWidth, controlHeight);
    const columns = (controlWidth - 1) * subdivisions + 1;
    const rows = (controlHeight - 1) * subdivisions + 1;
    const vertices = new Float32Array(columns * rows * 4);
    const indices = new Uint16Array((columns - 1) * (rows - 1) * 6);
    const uPower = 2 / (controlWidth - 1);
    const vPower = 2 / (controlHeight - 1);
    const preparedPoints: PreparedControlPoint[] = controlPoints.map((controlPoint) => ({
        ...controlPoint,
        uTangentX: tangent(controlPoint, 'u', 'x', uPower),
        uTangentY: tangent(controlPoint, 'u', 'y', uPower),
        vTangentX: tangent(controlPoint, 'v', 'x', vPower),
        vTangentY: tangent(controlPoint, 'v', 'y', vPower),
    }));
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
