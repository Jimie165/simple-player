import type { LowFrequencyFrame } from '@/features/player/apple/hooks/useLowFrequencyLevel';

function applySoftThreshold(value: number, threshold: number) {
    const normalized = Math.min(1, Math.max(0, (value - threshold) / (1 - threshold)));
    return normalized * normalized * (3 - 2 * normalized);
}

export class AudioResponse {
    private bassBody = 0;
    private beatImpulse = 0;

    update(frame: LowFrequencyFrame | undefined, elapsedMilliseconds: number) {
        const targetBass = Math.min(1, Math.max(0, frame?.bass ?? 0));
        const targetBeat = Math.min(1, Math.max(0, frame?.beat ?? 0));
        // 过滤低频底噪和弱 onset，避免背景在普通伴奏中持续轻微抖动。
        const gatedBass = applySoftThreshold(targetBass, 0.30);
        const gatedBeat = applySoftThreshold(targetBeat, 0.45);
        const deltaSeconds = Math.min(elapsedMilliseconds / 1000, 1 / 30);
        const bassTimeConstant = gatedBass > this.bassBody ? 0.08 : 0.30;
        const bassFollow = 1 - Math.exp(-deltaSeconds / bassTimeConstant);
        this.bassBody += (gatedBass - this.bassBody) * bassFollow;

        // 鼓点独立衰减，密集鼓点不会被平滑成恒定值。
        this.beatImpulse = Math.max(gatedBeat, this.beatImpulse * Math.exp(-deltaSeconds / 0.18));
        return Math.min(1, this.bassBody * 0.32 + this.beatImpulse * 0.68);
    }

    reset() {
        this.bassBody = 0;
        this.beatImpulse = 0;
    }
}
