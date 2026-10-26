import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useThemeStore } from '@/store/useThemeStore';
import { getLyricsScrollbarGeometry, getLyricsWheelDelta } from '@/features/player/scrollbar/lyricsScrollbarGeometry';
import { LyricsScrollbarScroll } from '@/features/player/scrollbar/lyricsScrollbarScroll';

interface LyricsScrollbarProps {
    enabled?: boolean;
    viewportRef: RefObject<HTMLElement | null>;
    style?: CSSProperties;
    onUserScroll?: (delta: number) => void;
    virtual?: {
        height: number;
        offset: number;
        getOffset?: () => number;
        subscribe?: (listener: () => void) => () => void;
        onScrollTo: (offset: number, behavior: ScrollBehavior) => void;
        onWheel: (delta: number) => void;
    };
}

export default function LyricsScrollbar(props: LyricsScrollbarProps) {
    const enabled = useThemeStore(state => state.lyricsScrollbarEnabled);
    return <LyricsScrollbarImpl {...props} enabled={props.enabled ?? enabled} />;
}

function LyricsScrollbarImpl({ viewportRef, style, virtual, onUserScroll, enabled }: LyricsScrollbarProps & { enabled: boolean }) {
    const reducedMotion = useReducedMotion();
    const [wheelScroll] = useState(() => new LyricsScrollbarScroll());
    const barRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);
    const sourceRef = useRef({ virtual, onUserScroll });
    const timerRef = useRef<number | null>(null);
    const dragRef = useRef<{ pointerId: number; y: number } | null>(null);
    useLayoutEffect(() => { sourceRef.current = { virtual, onUserScroll }; }, [virtual, onUserScroll]);
    const metrics = useCallback(() => {
        const viewport = viewportRef.current;
        const source = sourceRef.current.virtual;
        const height = viewport?.clientHeight ?? 0;
        const total = source?.height ?? viewport?.scrollHeight ?? 0;
        return getLyricsScrollbarGeometry(height, total, source?.getOffset?.() ?? source?.offset ?? viewport?.scrollTop ?? 0, barRef.current?.clientHeight ?? height);
    }, [viewportRef]);
    const update = useCallback(() => {
        const bar = barRef.current;
        const thumb = thumbRef.current;
        if (!bar || !thumb) return;
        const value = metrics();
        bar.hidden = !enabled || value.max <= 0;
        thumb.style.height = `${value.thumbHeight}px`;
        thumb.style.transform = `translateY(${value.max > 0 ? Math.max(0, Math.min(value.max, value.offset)) / value.max * (value.height - value.thumbHeight) : 0}px)`;
    }, [enabled, metrics]);
    const show = useCallback(() => {
        barRef.current?.setAttribute('data-scrolling', '');
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => barRef.current?.removeAttribute('data-scrolling'), 1000);
    }, []);
    const scrollTo = (offset: number, behavior: ScrollBehavior = 'instant') => {
        wheelScroll.cancel();
        const source = sourceRef.current;
        const value = metrics();
        const target = Math.max(0, Math.min(value.max, offset));
        if (source.virtual) source.virtual.onScrollTo(target, behavior);
        else if (viewportRef.current) {
            source.onUserScroll?.(target - value.offset);
            // 虚拟列表的向上测量补偿会打断原生 smooth，逐帧从实际位置继续推进。
            if (behavior === 'smooth') wheelScroll.moveTo(viewportRef.current, target);
            else viewportRef.current.scrollTo({ top: target, behavior });
        }
        update();
        show();
    };
    useLayoutEffect(update, [update, virtual?.height, virtual?.offset]);
    const subscribe = virtual?.subscribe;
    useEffect(() => subscribe?.(update), [update, subscribe]);
    useEffect(() => {
        const viewport = viewportRef.current;
        const bar = barRef.current;
        if (!viewport || !bar) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const delta = getLyricsWheelDelta(event.deltaY, event.deltaMode, viewport.clientHeight);
            const source = sourceRef.current;
            if (source.virtual) source.virtual.onWheel(event.deltaY * (event.deltaMode === 0 ? 1 : 50));
            else {
                source.onUserScroll?.(delta);
                wheelScroll.moveBy(viewport, delta);
            }
            update();
            show();
        };
        const observer = new ResizeObserver(update);
        observer.observe(viewport);
        observer.observe(bar);
        if (viewport.firstElementChild) {
            observer.observe(viewport.firstElementChild);
            for (const child of viewport.firstElementChild.children) observer.observe(child);
        }
        const cancelWheelScroll = () => wheelScroll.cancel();
        viewport.addEventListener('pointerdown', cancelWheelScroll);
        viewport.addEventListener('scroll', update, { passive: true });
        viewport.addEventListener('wheel', onWheel, { passive: false });
        viewport.addEventListener('touchmove', show, { passive: true });
        bar.addEventListener('wheel', onWheel, { passive: false });
        update();
        return () => {
            observer.disconnect();
            wheelScroll.cancel();
            viewport.removeEventListener('pointerdown', cancelWheelScroll);
            viewport.removeEventListener('scroll', update);
            viewport.removeEventListener('wheel', onWheel);
            viewport.removeEventListener('touchmove', show);
            bar.removeEventListener('wheel', onWheel);
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            dragRef.current = null;
        };
    }, [show, update, viewportRef, wheelScroll]);
    const finishDrag = () => {
        dragRef.current = null;
        barRef.current?.removeAttribute('data-dragging');
        show();
    };
    return (
        <div ref={barRef} className="plain-lyrics-scrollbar z-30" style={style} onPointerDown={event => {
            if (event.target !== event.currentTarget || !event.isPrimary || event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const value = metrics();
            const travel = value.height - value.thumbHeight;
            if (travel > 0) scrollTo((event.clientY - event.currentTarget.getBoundingClientRect().top - value.thumbHeight / 2) / travel * value.max, reducedMotion ? 'instant' : 'smooth');
        }}>
            <div ref={thumbRef} className="plain-lyrics-scrollbar-thumb" onPointerDown={event => {
                if (!event.isPrimary || event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                scrollTo(metrics().offset);
                dragRef.current = { pointerId: event.pointerId, y: event.clientY };
                barRef.current?.setAttribute('data-dragging', '');
                event.currentTarget.setPointerCapture(event.pointerId);
                show();
            }} onPointerMove={event => {
                const drag = dragRef.current;
                if (drag?.pointerId === event.pointerId) {
                    const value = metrics();
                    const travel = value.height - value.thumbHeight;
                    const delta = (event.clientY - drag.y) * (travel > 0 ? value.max / travel : 0);
                    drag.y = event.clientY;
                    scrollTo(value.offset + delta);
                }
            }} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag} />
        </div>
    );
}
