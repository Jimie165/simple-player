export interface FluidSpringParams {
    stiffness: number;
    damping: number;
    mass: number;
    restDelta?: number;
    restSpeed?: number;
}

interface PendingTarget {
    delay: number;
    params: FluidSpringParams;
    position: number;
}

const sameParams = (left: FluidSpringParams, right: FluidSpringParams) => (
    left.stiffness === right.stiffness &&
    left.damping === right.damping &&
    left.mass === right.mass &&
    left.restDelta === right.restDelta &&
    left.restSpeed === right.restSpeed
);

/**
 * 保留当前位置和速度的延迟弹簧。解析推进避免帧率波动改变运动轨迹。
 */
export class FluidLyricsSpring {
    private position: number;
    private velocity = 0;
    private target: number;
    private params: FluidSpringParams;
    private pendingTarget: PendingTarget | null = null;

    constructor(position: number, params: FluidSpringParams) {
        this.position = position;
        this.target = position;
        this.params = params;
    }

    getPosition() {
        return this.position;
    }

    isAnimating() {
        return this.pendingTarget !== null || !this.isAtRest();
    }

    setPosition(position: number) {
        this.position = position;
        this.target = position;
        this.velocity = 0;
        this.pendingTarget = null;
    }

    setTarget(position: number, params: FluidSpringParams, delay = 0) {
        if (
            this.pendingTarget?.position === position &&
            sameParams(this.pendingTarget.params, params)
        ) {
            return;
        }
        if (this.pendingTarget === null && this.target === position && sameParams(this.params, params)) {
            return;
        }

        if (delay > 0) {
            this.pendingTarget = { delay, params, position };
            return;
        }

        this.pendingTarget = null;
        this.target = position;
        this.params = params;
    }

    advance(deltaSeconds: number) {
        let remaining = Math.max(0, deltaSeconds);

        if (this.pendingTarget) {
            const beforeTarget = Math.min(remaining, this.pendingTarget.delay);
            this.advanceActiveSpring(beforeTarget);
            remaining -= beforeTarget;
            this.pendingTarget.delay -= beforeTarget;

            if (this.pendingTarget.delay <= 0) {
                const pending = this.pendingTarget;
                this.pendingTarget = null;
                this.target = pending.position;
                this.params = pending.params;
            }
        }

        this.advanceActiveSpring(remaining);
        if (this.pendingTarget === null && this.isAtRest()) this.setPosition(this.target);
        return this.position;
    }

    private isAtRest() {
        return (
            Math.abs(this.target - this.position) <= (this.params.restDelta ?? 0.01) &&
            Math.abs(this.velocity) <= (this.params.restSpeed ?? 0.01)
        );
    }

    private advanceActiveSpring(deltaSeconds: number) {
        if (deltaSeconds <= 0 || this.isAtRest()) return;

        const { damping, mass, stiffness } = this.params;
        const displacement = this.position - this.target;
        const discriminant = damping * damping - 4 * mass * stiffness;

        if (Math.abs(discriminant) < 0.000001) {
            const root = -damping / (2 * mass);
            const coefficient = this.velocity - root * displacement;
            const decay = Math.exp(root * deltaSeconds);
            const nextDisplacement = (displacement + coefficient * deltaSeconds) * decay;
            const nextVelocity = (coefficient + root * (displacement + coefficient * deltaSeconds)) * decay;
            this.position = this.target + nextDisplacement;
            this.velocity = nextVelocity;
            return;
        }

        if (discriminant > 0) {
            const rootDelta = Math.sqrt(discriminant);
            const rootA = (-damping + rootDelta) / (2 * mass);
            const rootB = (-damping - rootDelta) / (2 * mass);
            const coefficientA = (this.velocity - rootB * displacement) / (rootA - rootB);
            const coefficientB = displacement - coefficientA;
            const expA = Math.exp(rootA * deltaSeconds);
            const expB = Math.exp(rootB * deltaSeconds);
            this.position = this.target + coefficientA * expA + coefficientB * expB;
            this.velocity = coefficientA * rootA * expA + coefficientB * rootB * expB;
            return;
        }

        const decayRate = damping / (2 * mass);
        const angularFrequency = Math.sqrt(4 * mass * stiffness - damping * damping) / (2 * mass);
        const sineCoefficient = (this.velocity + decayRate * displacement) / angularFrequency;
        const angle = angularFrequency * deltaSeconds;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const decay = Math.exp(-decayRate * deltaSeconds);
        const oscillation = displacement * cosine + sineCoefficient * sine;
        this.position = this.target + decay * oscillation;
        this.velocity = decay * (
            -decayRate * oscillation +
            angularFrequency * (-displacement * sine + sineCoefficient * cosine)
        );
    }
}
