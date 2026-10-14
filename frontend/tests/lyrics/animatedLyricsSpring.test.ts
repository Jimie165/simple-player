import { describe, expect, it } from 'vitest';
import { AnimatedLyricsSpring } from '@/features/player/lyrics/animatedLyricsSpring';

const params = {
    stiffness: 90,
    damping: 15,
    mass: 1,
    restDelta: 0.0001,
    restSpeed: 0.001,
};

describe('AnimatedLyricsSpring', () => {
    it('keeps the current position and velocity when a delayed target replaces it', () => {
        const spring = new AnimatedLyricsSpring(0, params);
        spring.setTarget(120, params);
        spring.advance(0.12);
        const positionBeforeRetarget = spring.getPosition();

        spring.setTarget(260, params, 0.2);
        spring.advance(0.05);

        // The delay pauses the new target, but the existing motion continues;
        // snapping here would reintroduce a visible row rollback.
        expect(spring.getPosition()).not.toBe(positionBeforeRetarget);
        expect(spring.getPosition()).toBeLessThan(120);
    });

    it('settles exactly at the target after the analytical tail', () => {
        const spring = new AnimatedLyricsSpring(0, params);
        spring.setTarget(90, params);
        for (let i = 0; i < 240; i++) spring.advance(1 / 120);

        expect(spring.getPosition()).toBe(90);
        expect(spring.isAnimating()).toBe(false);
    });
});
