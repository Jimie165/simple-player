export interface AudioOnset {
    readonly sequence: number;
    readonly strength: number;
    readonly age_ms: number;
}

export interface LowFrequencyFrame {
    readonly generation: number;
    readonly bass: number;
    readonly onsets: readonly AudioOnset[];
    readonly receivedAt?: number;
}

export const SILENT_AUDIO_FRAME: LowFrequencyFrame = { generation: 0, bass: 0, onsets: [] };
const clamp01 = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const PEAK_HOLD_SECONDS = 0.07;
const RELEASE_SECONDS = 0.75;
const FOLLOW_SECONDS = 0.045;

const smoothPower = (value: number) => {
    const x = clamp01(value);
    return x * x * x * (x * (x * 6 - 15) + 10);
};

export class AudioResponse {
    private generation = 0;
    private lastSequence = 0;
    private body = 0;
    private pulse = 0;
    private target = 0;
    private hold = 0;

    private advance(seconds: number) {
        if (seconds <= 0 || (this.target === 0 && this.pulse === 0)) return;
        const held = Math.min(seconds, this.hold);
        this.hold -= held;
        this.pulse = this.target + (this.pulse - this.target) * Math.exp(-held / FOLLOW_SECONDS);
        const released = seconds - held;
        const decay = Math.exp(-released / RELEASE_SECONDS);
        const follow = Math.exp(-released / FOLLOW_SECONDS);
        // Exact integration of a following envelope and its decaying target keeps
        // the same motion at 30/60fps, including frames crossing the hold boundary.
        this.pulse = this.pulse * follow + this.target * RELEASE_SECONDS
            / (RELEASE_SECONDS - FOLLOW_SECONDS) * (decay - follow);
        this.target *= decay;
        if (this.target < 0.00001 && this.pulse < 0.00001) this.target = this.pulse = 0;
    }

    private lift(strength: number, age: number) {
        const released = Math.max(0, age - PEAK_HOLD_SECONDS);
        const target = strength * Math.exp(-released / RELEASE_SECONDS);
        // A weaker onset must not add a bump or extend the current peak's hold.
        if (target <= this.target) return;
        this.target = target;
        this.hold = Math.max(0, PEAK_HOLD_SECONDS - age);
        if (age > 0) {
            const heldPulse = strength * (1 - Math.exp(-Math.min(age, PEAK_HOLD_SECONDS) / FOLLOW_SECONDS));
            const follow = Math.exp(-released / FOLLOW_SECONDS);
            const recovered = heldPulse * follow + strength * RELEASE_SECONDS
                / (RELEASE_SECONDS - FOLLOW_SECONDS) * (Math.exp(-released / RELEASE_SECONDS) - follow);
            this.pulse = Math.max(this.pulse, recovered);
        }
    }

    update(frame: LowFrequencyFrame | undefined, elapsedMilliseconds: number, now = performance.now()) {
        const delta = Number.isFinite(elapsedMilliseconds)
            ? Math.max(elapsedMilliseconds / 1000, 0) : 0;
        if (!frame || frame.generation === 0) { this.reset(); return; }
        if (frame.generation < this.generation) return;
        if (frame.generation !== this.generation) {
            this.reset();
            this.generation = frame.generation;
        }
        const deliveryAge = frame.receivedAt === undefined ? 0 : Math.max(0, now - frame.receivedAt);
        let cursor = 0;
        for (const event of frame.onsets) {
            if (!Number.isSafeInteger(event.sequence) || event.sequence <= this.lastSequence) continue;
            this.lastSequence = event.sequence;
            const age = (event.age_ms + deliveryAge) / 1000;
            if (!Number.isFinite(age) || age < 0 || age > 0.25) continue;
            // Reports are chronological. Split the frame at each onset instead of
            // restarting an animation at delivery time or summing separate pulses.
            const offset = Math.max(cursor, delta - age);
            this.advance(offset - cursor);
            this.lift(clamp01(event.strength), Math.max(0, age - delta));
            cursor = offset;
        }
        this.advance(delta - cursor);
        const target = deliveryAge < 180 ? clamp01(frame.bass) : 0;
        this.body += (target - this.body) * (1 - Math.exp(-delta / (target > this.body ? 0.22 : 0.35)));
    }

    get scale() {
        // Material expansion before mesh deformation; sustained energy stays a small base.
        const power = smoothPower(this.pulse);
        return 1 + Math.min(0.33, power * power * 0.31 + this.body * 0.02);
    }

    reset() {
        this.generation = 0;
        this.lastSequence = 0;
        this.body = 0;
        this.pulse = 0;
        this.target = 0;
        this.hold = 0;
    }
}
