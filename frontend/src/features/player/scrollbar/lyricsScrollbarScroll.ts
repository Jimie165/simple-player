export class LyricsScrollbarScroll {
    private frame: number | null = null;
    private motion: { element: HTMLElement; target: number; lastTime: number } | null = null;

    cancel() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        this.motion = null;
    }

    moveBy(element: HTMLElement, delta: number) {
        if (!Number.isFinite(delta) || delta === 0) return;
        this.moveTo(element, (this.motion?.element === element ? this.motion.target : element.scrollTop) + delta);
    }

    moveTo(element: HTMLElement, target: number) {
        if (!Number.isFinite(target)) return;
        if (this.motion?.element !== element) {
            this.cancel();
            this.motion = { element, target: element.scrollTop, lastTime: performance.now() };
        }
        this.motion.target = Math.max(0, Math.min(Math.max(0, element.scrollHeight - element.clientHeight), target));
        if (this.frame === null) this.frame = requestAnimationFrame(this.tick);
    }

    private tick = (now: number) => {
        this.frame = null;
        const motion = this.motion;
        if (!motion) return;
        const deltaMs = Math.min(64, Math.max(0, now - motion.lastTime));
        motion.lastTime = now;
        const max = Math.max(0, motion.element.scrollHeight - motion.element.clientHeight);
        motion.target = Math.min(max, motion.target);
        const remaining = motion.target - motion.element.scrollTop;
        const finished = Math.abs(remaining) <= 0.5;
        const step = Math.sign(remaining) * Math.min(Math.abs(remaining), Math.max(1, Math.abs(remaining) * (1 - Math.exp(-deltaMs / 70))));
        motion.element.scrollTo({ top: finished ? motion.target : motion.element.scrollTop + step, behavior: 'instant' });
        if (finished) this.motion = null;
        else this.frame = requestAnimationFrame(this.tick);
    };
}
