import { useLayoutEffect, useRef } from 'react';

interface QueueSourceLabelProps {
    label: string;
    className: string;
    blend: boolean;
    isOpen: boolean;
    onClick: () => void;
}

export default function QueueSourceLabel({ label, className, blend, isOpen, onClick }: QueueSourceLabelProps) {
    const sourceRef = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const source = sourceRef.current;
        const root = source?.closest<HTMLElement>('[data-now-playing-root]');
        const viewport = source?.closest<HTMLElement>('[data-queue-viewport]');
        if (!blend || !source || !root || !viewport) return;
        const layer = document.createElement('div');
        const text = document.createElement('span');
        layer.setAttribute('data-queue-source-blend', '');
        layer.setAttribute('aria-hidden', 'true');
        Object.assign(layer.style, {
            position: 'absolute', pointerEvents: 'none', overflow: 'hidden', zIndex: '30', mixBlendMode: 'plus-lighter', transformOrigin: 'top left',
        });
        Object.assign(text.style, {
            position: 'absolute', display: 'block', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        });
        text.textContent = label;
        layer.append(text);
        root.append(layer);
        const originalColor = source.style.color;
        source.style.color = 'transparent';
        let frame: number | null = null;
        let animateUntil = 0;
        const update = () => {
            const rootRect = root.getBoundingClientRect();
            const viewportRect = viewport.getBoundingClientRect();
            const rect = source.getBoundingClientRect();
            if (!root.offsetWidth || !root.offsetHeight || !viewport.offsetWidth || !viewport.offsetHeight) return;
            const rootScaleX = rootRect.width / root.offsetWidth;
            const rootScaleY = rootRect.height / root.offsetHeight;
            const scaleX = viewportRect.width / viewport.offsetWidth;
            const scaleY = viewportRect.height / viewport.offsetHeight;
            if (!rootScaleX || !rootScaleY || !scaleX || !scaleY) return;
            const sourceStyle = getComputedStyle(source);
            const viewportStyle = getComputedStyle(viewport);
            let opacity = 1;
            for (let parent = source.parentElement; parent && parent !== root; parent = parent.parentElement) {
                opacity *= Number(getComputedStyle(parent).opacity);
            }
            Object.assign(layer.style, {
                left: `${(viewportRect.left - rootRect.left) / rootScaleX}px`, top: `${(viewportRect.top - rootRect.top) / rootScaleY}px`,
                width: `${viewport.offsetWidth}px`, height: `${viewport.offsetHeight}px`, opacity: String(opacity),
                transform: `scale(${scaleX / rootScaleX}, ${scaleY / rootScaleY})`,
                maskImage: viewportStyle.maskImage, WebkitMaskImage: viewportStyle.maskImage,
                clipPath: viewportStyle.clipPath,
            });
            Object.assign(text.style, {
                left: `${(rect.left - viewportRect.left) / scaleX}px`, top: `${(rect.top - viewportRect.top) / scaleY}px`,
                width: `${rect.width / scaleX}px`, height: `${rect.height / scaleY}px`, font: sourceStyle.font,
                letterSpacing: sourceStyle.letterSpacing, opacity: sourceStyle.opacity,
                textDecorationLine: sourceStyle.textDecorationLine, textDecorationColor: 'white',
                textDecorationThickness: sourceStyle.textDecorationThickness, textUnderlineOffset: sourceStyle.textUnderlineOffset,
            });
        };
        const tick = () => {
            frame = null;
            update();
            if (performance.now() < animateUntil) frame = requestAnimationFrame(tick);
        };
        const refresh = () => {
            animateUntil = performance.now() + 1000;
            if (frame === null) frame = requestAnimationFrame(tick);
        };
        const observer = new ResizeObserver(refresh);
        observer.observe(source);
        observer.observe(viewport);
        // 面板缩放不会触发布局尺寸变化，需要跟随祖先动画样式更新混合层。
        const motionObserver = new MutationObserver(refresh);
        for (let parent = source.parentElement; parent; parent = parent.parentElement) {
            motionObserver.observe(parent, { attributes: true, attributeFilter: ['style', 'class'] });
            if (parent === root) break;
        }
        viewport.addEventListener('scroll', refresh, { passive: true });
        const pointerEvents = ['pointerenter', 'pointerleave', 'pointerdown', 'pointerup'] as const;
        pointerEvents.forEach(event => source.addEventListener(event, refresh));
        update();
        refresh();
        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
            observer.disconnect();
            motionObserver.disconnect();
            viewport.removeEventListener('scroll', refresh);
            pointerEvents.forEach(event => source.removeEventListener(event, refresh));
            layer.remove();
            source.style.color = originalColor;
        };
    }, [blend, isOpen, label]);

    return <span ref={sourceRef} className={className} onClick={onClick}>{label}</span>;
}
