import { useRef } from 'react';
import type { PointerEvent } from 'react';

/** Keep native range dragging active for mouse, touch and pen, including release outside the input. */
export function useRangePointerDrag(
    onStart?: () => void,
    onEnd?: (event: PointerEvent<HTMLInputElement>) => void,
) {
    const activePointer = useRef<number | null>(null);

    const finishDrag = (event: PointerEvent<HTMLInputElement>) => {
        if (activePointer.current !== event.pointerId) return;
        activePointer.current = null;
        onEnd?.(event);
    };

    return {
        onPointerDown: (event: PointerEvent<HTMLInputElement>) => {
            if (!event.isPrimary || event.button !== 0 || activePointer.current !== null) return;
            activePointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            onStart?.();
        },
        onPointerUp: finishDrag,
        onPointerCancel: finishDrag,
        onLostPointerCapture: finishDrag,
    };
}
