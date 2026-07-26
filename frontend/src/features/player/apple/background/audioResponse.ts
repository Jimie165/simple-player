export interface LowFrequencyFrame {
    readonly bass: number;
    readonly beat: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export class AudioResponse {
    private bassBaseline = 0;
    private bassPulse = 0;
    private beatImpulse = 0;
    private luminanceBody = 0;

    update(frame: LowFrequencyFrame | undefined, elapsedMilliseconds: number) {
        const targetBass = clamp01(frame?.bass ?? 0);
        const targetBeat = clamp01(frame?.beat ?? 0);
        const deltaSeconds = Math.min(Math.max(elapsedMilliseconds, 0) / 1000, 1 / 30);
        const baselineFollow = 1 - Math.exp(-deltaSeconds / 1.2);
        this.bassBaseline += (targetBass - this.bassBaseline) * baselineFollow;

        const dynamicBass = clamp01((targetBass - this.bassBaseline) * 3.2);
        const bassTimeConstant = dynamicBass > this.bassPulse ? 0.055 : 0.24;
        const bassFollow = 1 - Math.exp(-deltaSeconds / bassTimeConstant);
        this.bassPulse += (dynamicBass - this.bassPulse) * bassFollow;

        const normalizedBeat = clamp01((targetBeat - 0.1) / 0.9);
        const gatedBeat = normalizedBeat ** 0.7;
        const beatTimeConstant = gatedBeat > this.beatImpulse ? 0.025 : 0.18;
        const beatFollow = 1 - Math.exp(-deltaSeconds / beatTimeConstant);
        this.beatImpulse += (gatedBeat - this.beatImpulse) * beatFollow;

        const luminanceTarget = clamp01(this.bassPulse * 0.72 + this.beatImpulse * 0.18);
        const luminanceTimeConstant = luminanceTarget > this.luminanceBody ? 0.16 : 0.5;
        const luminanceFollow = 1 - Math.exp(-deltaSeconds / luminanceTimeConstant);
        this.luminanceBody += (luminanceTarget - this.luminanceBody) * luminanceFollow;
    }

    get motion() {
        const bassMotion = this.bassPulse * 0.65;
        const beatMotion = this.beatImpulse * 0.38;
        return clamp01((bassMotion + beatMotion * (1 - bassMotion)) / 0.783);
    }

    get luminance() {
        return clamp01(this.luminanceBody);
    }

    reset() {
        this.bassBaseline = 0;
        this.bassPulse = 0;
        this.beatImpulse = 0;
        this.luminanceBody = 0;
    }
}
