// 同一目标的虚拟列表测量修正不得重新启动缓动，否则长距离滚动会反复减速。
export class PerformanceLyricsScroll {
    private frame: number | null = null;
    private motion: {
        element: HTMLElement; index: number; target: number;
        start: number; duration: number; progress: number;
    } | null = null;

    cancel() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        this.motion = null;
    }

    move(element: HTMLElement, index: number, target: number, smooth: boolean) {
        target = Math.max(0, Math.min(target, Math.max(0, element.scrollHeight - element.clientHeight)));
        if (smooth && this.motion?.element === element && this.motion.index === index) {
            this.motion.target = target;
            return;
        }
        this.cancel();
        if (!smooth || Math.abs(target - element.scrollTop) < 0.5) {
            element.scrollTo({ top: target, behavior: 'instant' });
            return;
        }
        this.motion = {
            element, index, target, start: performance.now(), progress: 0,
            duration: Math.min(450, 220 + Math.abs(target - element.scrollTop) * 0.08),
        };
        this.frame = requestAnimationFrame(this.tick);
    }

    private tick = (now: number) => {
        this.frame = null;
        const motion = this.motion;
        if (!motion) return;
        const t = Math.min(1, Math.max(0, (now - motion.start) / motion.duration));
        const progress = 1 - (1 - t) ** 3;
        // 从实际位置推进剩余距离，吸收列表的高度修正，不跳回旧起点。
        const fraction = (progress - motion.progress) / (1 - motion.progress);
        motion.element.scrollTo({
            top: motion.element.scrollTop + (motion.target - motion.element.scrollTop) * fraction,
            behavior: 'instant',
        });
        motion.progress = progress;
        if (t === 1) this.motion = null;
        else this.frame = requestAnimationFrame(this.tick);
    };
}
