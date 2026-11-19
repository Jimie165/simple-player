import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cancelFrame, frame } from 'framer-motion';

interface QueueSourceLabelProps {
    label: string;
    className: string;
    blend: boolean;
    onClick?: () => void;
    children?: ReactNode;
}

export default function QueueSourceLabel({
    label,
    className,
    blend,
    onClick,
    children,
}: QueueSourceLabelProps) {
    const sourceRef = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const source = sourceRef.current;
        const root = source?.closest<HTMLElement>('[data-now-playing-root]');
        // 混合层按所在的裁剪框（列表视口或固定的分区标题）定位并复制其遮罩。
        const viewport = source?.closest<HTMLElement>('[data-queue-blend-frame]');
        if (!blend || !source || !root || !viewport) return;
        const layer = document.createElement('div');
        const text = document.createElement('span');
        layer.setAttribute('data-queue-source-blend', '');
        layer.setAttribute('aria-hidden', 'true');
        Object.assign(layer.style, {
            position: 'absolute',
            pointerEvents: 'none',
            overflow: 'hidden',
            zIndex: '30',
            mixBlendMode: 'plus-lighter',
            transformOrigin: 'top left',
        });
        Object.assign(text.style, {
            position: 'absolute',
            display: 'block',
            color: 'white',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        });
        const artwork = source.querySelector('svg');
        const artworkCopy = artwork?.cloneNode(true) as SVGElement | undefined;
        if (artworkCopy) {
            // Keep SVG mask references unique when mirroring the icon outside the masked queue.
            for (const element of artworkCopy.querySelectorAll('[id]')) {
                const id = element.id;
                const copyId = `${id}-blend`;
                element.id = copyId;
                for (const masked of artworkCopy.querySelectorAll(`[mask="url(#${id})"]`))
                    masked.setAttribute('mask', `url(#${copyId})`);
            }
            text.append(artworkCopy);
        } else text.textContent = label;
        layer.append(text);
        root.append(layer);
        const originalColor = source.style.color;
        source.style.color = 'transparent';
        let scheduled = false;
        let animateUntil = 0;
        const update = () => {
            const rootRect = root.getBoundingClientRect();
            const viewportRect = viewport.getBoundingClientRect();
            const rect = source.getBoundingClientRect();
            if (
                !root.offsetWidth ||
                !root.offsetHeight ||
                !viewport.offsetWidth ||
                !viewport.offsetHeight
            )
                return;
            const rootScaleX = rootRect.width / root.offsetWidth;
            const rootScaleY = rootRect.height / root.offsetHeight;
            const scaleX = viewportRect.width / viewport.offsetWidth;
            const scaleY = viewportRect.height / viewport.offsetHeight;
            if (!rootScaleX || !rootScaleY || !scaleX || !scaleY) return;
            const sourceStyle = getComputedStyle(source);
            const viewportStyle = getComputedStyle(viewport);
            // 混合层在面板之外，需要叠加祖先的透明度与滤镜，才能和队列其余内容同步过渡。
            let opacity = 1;
            const filters: string[] = [];
            // 遮罩可能在裁剪框的祖先上（如侧栏面板的底部渐隐），按各自盒子换算到混合层坐标后求交。
            const masks: string[] = [];
            const maskPositions: string[] = [];
            const maskSizes: string[] = [];
            let inFrame = false;
            for (
                let parent = source.parentElement;
                parent && parent !== root;
                parent = parent.parentElement
            ) {
                const parentStyle = getComputedStyle(parent);
                opacity *= Number(parentStyle.opacity);
                if (parentStyle.filter !== 'none') filters.push(parentStyle.filter);
                if (parent === viewport) inFrame = true;
                if (!inFrame || parentStyle.maskImage === 'none') continue;
                const box = parent === viewport ? viewportRect : parent.getBoundingClientRect();
                masks.push(parentStyle.maskImage);
                maskPositions.push(
                    `${(box.left - viewportRect.left) / scaleX}px ${(box.top - viewportRect.top) / scaleY}px`,
                );
                maskSizes.push(`${box.width / scaleX}px ${box.height / scaleY}px`);
            }
            const maskImage = masks.join(', ') || 'none';
            Object.assign(layer.style, {
                left: `${(viewportRect.left - rootRect.left) / rootScaleX}px`,
                top: `${(viewportRect.top - rootRect.top) / rootScaleY}px`,
                width: `${viewport.offsetWidth}px`,
                height: `${viewport.offsetHeight}px`,
                opacity: String(opacity),
                filter: filters.join(' ') || 'none',
                transform: `scale(${scaleX / rootScaleX}, ${scaleY / rootScaleY})`,
                maskImage,
                WebkitMaskImage: maskImage,
                maskPosition: maskPositions.join(', '),
                maskSize: maskSizes.join(', '),
                maskRepeat: 'no-repeat',
                maskComposite: 'intersect',
                clipPath: viewportStyle.clipPath,
            });
            // 字号随窗口宽度取到小数像素时，副本可能比原文宽出亚像素而被误加省略号；
            // 因此只在原文确实被截断时才限制副本宽度。图标副本按容器尺寸绘制，始终使用原宽度。
            // scrollWidth/clientWidth 均取整，留 1px 容差。
            const truncated = source.scrollWidth - source.clientWidth > 1;
            Object.assign(text.style, {
                left: `${(rect.left - viewportRect.left) / scaleX}px`,
                top: `${(rect.top - viewportRect.top) / scaleY}px`,
                width: artwork || truncated ? `${rect.width / scaleX}px` : 'auto',
                height: `${rect.height / scaleY}px`,
                font: sourceStyle.font,
                letterSpacing: sourceStyle.letterSpacing,
                opacity: sourceStyle.opacity,
                textDecorationLine: sourceStyle.textDecorationLine,
                textDecorationColor: 'white',
                textDecorationThickness: sourceStyle.textDecorationThickness,
                textUnderlineOffset: sourceStyle.textUnderlineOffset,
            });
            if (artwork && artworkCopy) artworkCopy.style.opacity = getComputedStyle(artwork).opacity;
        };
        // 在 framer-motion 写入本帧样式之后再同步，否则面板动画时混合层会落后一帧而显得弹跳。
        const tick = () => {
            scheduled = false;
            update();
            if (performance.now() < animateUntil) {
                scheduled = true;
                frame.postRender(tick);
            }
        };
        const refresh = () => {
            animateUntil = performance.now() + 1000;
            if (!scheduled) {
                scheduled = true;
                frame.postRender(tick);
            }
        };
        const observer = new ResizeObserver(refresh);
        observer.observe(source);
        observer.observe(viewport);
        // 面板缩放不会触发布局尺寸变化，需要跟随祖先动画样式更新混合层。
        const motionObserver = new MutationObserver(() => {
            // Synchronize after the animation writes its transform, before this frame is painted.
            update();
            refresh();
        });
        for (let parent = source.parentElement; parent; parent = parent.parentElement) {
            // 拖拽重排时虚拟列表会移动分区标题行而不改变任何尺寸，只能通过行的 data-index 变化察觉位置改变。
            motionObserver.observe(parent, {
                attributes: true,
                attributeFilter: ['style', 'class', 'data-index'],
            });
            if (parent === root) break;
        }
        viewport.addEventListener('scroll', refresh, { passive: true });
        const pointerEvents = ['pointerenter', 'pointerleave', 'pointerdown', 'pointerup'] as const;
        pointerEvents.forEach((event) => source.addEventListener(event, refresh));
        update();
        refresh();
        return () => {
            cancelFrame(tick);
            observer.disconnect();
            motionObserver.disconnect();
            viewport.removeEventListener('scroll', refresh);
            pointerEvents.forEach((event) => source.removeEventListener(event, refresh));
            layer.remove();
            source.style.color = originalColor;
        };
    }, [blend, label, children]);

    return (
        <span role="presentation" ref={sourceRef} className={className} onClick={onClick}>
            {children ?? label}
        </span>
    );
}
