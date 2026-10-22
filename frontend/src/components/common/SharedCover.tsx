import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useAnimationControls, useIsPresent } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';
import { detailTransition, getCoverFrame } from '@/utils/viewTransition';
import type { CoverTransitionFrame, CoverTransitionSource } from '@/utils/viewTransition';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useThemeStore } from '@/store/useThemeStore';

type SharedCoverProps = Omit<HTMLMotionProps<'div'>, 'children'> & {
    source?: CoverTransitionSource;
    children: ReactNode;
};

/** Native covers are stable layout targets; one application-level frame owns movement. */
export default function SharedCover({ source, children, className, layoutId, ...props }: SharedCoverProps) {
    const [ready, setReady] = useState(false);
    const coverRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const decodedImages = useRef(new WeakMap<HTMLImageElement, string>());
    const isPresent = useIsPresent();
    const moreTransitionsEnabled = useThemeStore(state => state.moreTransitionsEnabled);
    const coverId = source?.coverId ?? layoutId;
    const transition = useNavigationStore(state => {
        const snapshot = state.coverTransition;
        return snapshot && snapshot.coverId === coverId && !snapshot.flight?.handedOff ? snapshot : null;
    });
    const from = transition?.flight?.from;
    const direction = transition?.flight?.direction;
    const receiving = moreTransitionsEnabled && isPresent && (source ? direction === 'enter' : direction === 'return');

    useLayoutEffect(() => {
        const cover = coverRef.current;
        const viewport = cover?.closest<HTMLElement>('[data-scroll-viewport]');
        if (!moreTransitionsEnabled || !source || !isPresent || !cover || !viewport) return;
        const frame = getCoverFrame(cover);
        if (frame.width <= 0 || frame.height <= 0) return;
        useNavigationStore.getState().startCoverEnter(source, frame, {
            top: viewport.scrollTop, left: viewport.scrollLeft,
        });
    }, [source, isPresent, moreTransitionsEnabled]);

    useLayoutEffect(() => {
        if (!receiving || !coverId || !from) return;
        // Recycling a target must not leave the moving frame waiting for its image.
        return () => useNavigationStore.getState().releaseCoverTransition(coverId, from);
    }, [receiving, coverId, from]);

    const handleImagesLoaded = useCallback(async () => {
        if (!source && !receiving) return;
        const content = contentRef.current;
        if (!content) return;
        const loaded = Array.from(content.querySelectorAll('img'));
        if (loaded.length === 0 || loaded.some(image => !image.complete || image.naturalWidth === 0)) return;
        const urls = loaded.map(image => image.currentSrc);
        try {
            await Promise.all(loaded
                .filter(image => decodedImages.current.get(image) !== image.currentSrc)
                .map(image => image.decode()));
        } catch {
            return;
        }
        if (contentRef.current !== content
            || loaded.some((image, index) => !content.contains(image) || image.currentSrc !== urls[index])) return;
        loaded.forEach((image, index) => decodedImages.current.set(image, urls[index]));
        setReady(true);
        if (receiving && coverId && from) {
            useNavigationStore.getState().releaseCoverTransition(coverId, from);
        }
    }, [source, receiving, coverId, from]);

    useLayoutEffect(() => { void handleImagesLoaded(); }, [handleImagesLoaded]);

    return (
        <motion.div
            {...props}
            ref={coverRef}
            data-transition-cover={coverId}
            data-cover-detail={source ? '' : undefined}
            style={{
                ...props.style,
                visibility: receiving || (moreTransitionsEnabled && source && !isPresent && direction === 'return') ? 'hidden' : props.style?.visibility,
            }}
            className={clsx('relative', className)}
        >
            <div ref={contentRef} className="flex h-full w-full items-center justify-center" onLoadCapture={handleImagesLoaded}>
                {children}
            </div>
            {!ready && !!source?.images?.length && (
                <div data-shared-cover-snapshot aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                    <CoverSnapshot images={source.images} />
                </div>
            )}
        </motion.div>
    );
}

function CoverSnapshot({ images }: Pick<CoverTransitionSource, 'images'>) {
    return images?.map((image, index) => (
        <img key={`${index}:${image.src}`} src={image.src} alt="" loading="eager" decoding="sync"
            className="absolute object-cover"
            style={{ left: `${image.left}%`, top: `${image.top}%`, width: `${image.width}%`, height: `${image.height}%` }}
        />
    ));
}

/** Like AMLL's measured cover frame, this node survives entry, idle and return. */
export function CoverTransitionOverlay() {
    const source = useNavigationStore(state => state.coverTransition);
    const moreTransitionsEnabled = useThemeStore(state => state.moreTransitionsEnabled);
    const rootRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const controls = useAnimationControls();
    const coverId = source?.coverId;
    const from = source?.flight?.from;
    const to = source?.flight?.to;
    const direction = source?.flight?.direction;
    const scroll = source?.flight?.scroll;
    const active = moreTransitionsEnabled && !!source?.flight && !source.flight.handedOff;

    useLayoutEffect(() => {
        if (!moreTransitionsEnabled && useNavigationStore.getState().coverTransition) {
            useNavigationStore.getState().clearCoverTransition();
        }
    }, [moreTransitionsEnabled]);

    useLayoutEffect(() => {
        const layer = rootRef.current;
        const scrollLayer = scrollRef.current;
        if (!active || !coverId || !from || !to || !direction || !layer) return;
        const target = Array.from(document.querySelectorAll<HTMLElement>('[data-transition-cover]'))
            .find(element => element.dataset.transitionCover === coverId
                && element.hasAttribute('data-cover-detail') === (direction === 'enter'));
        const root = target?.closest<HTMLElement>('[data-main-content-query]');
        const viewport = target?.closest<HTMLElement>('[data-scroll-viewport]');
        let disposed = false;
        let cancelled = false;
        let completed = false;
        let animation = 0;
        const cancel = () => {
            if (disposed || cancelled) return;
            cancelled = true;
            controls.stop();
            layer.style.visibility = 'hidden';
            const navigation = useNavigationStore.getState();
            navigation.completeCoverTransition(coverId, from);
            navigation.releaseCoverTransition(coverId, from);
        };
        if (!target || !root || !viewport) {
            cancel();
            return;
        }
        const origin = scroll ?? { top: viewport.scrollTop, left: viewport.scrollLeft };
        const detailLayer = direction === 'return'
            ? Array.from(root.querySelectorAll<HTMLElement>('[data-transition-layer]'))
                .find(element => element.dataset.transitionLayer === coverId)
            : undefined;
        const positionRoot = () => {
            const bounds = root.getBoundingClientRect();
            Object.assign(layer.style, {
                left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`,
            });
            return bounds;
        };
        const relativeFrame = (frame: CoverTransitionFrame): CoverTransitionFrame => {
            const bounds = positionRoot();
            return { ...frame, left: frame.left - bounds.left, top: frame.top - bounds.top };
        };
        const updateScroll = () => {
            if (disposed || cancelled) return;
            const x = origin.left - viewport.scrollLeft;
            const y = origin.top - viewport.scrollTop;
            if (scrollLayer) scrollLayer.style.translate = `${x}px ${y}px`;
            if (detailLayer) detailLayer.style.translate = `${x}px ${y}px`;
            const bounds = viewport.getBoundingClientRect();
            const frame = getCoverFrame(target);
            if (!target.isConnected || frame.top + frame.height <= bounds.top || frame.top >= bounds.bottom
                || frame.left + frame.width <= bounds.left || frame.left >= bounds.right) cancel();
        };
        let lastTarget: CoverTransitionFrame | null = null;
        const updateLayout = () => {
            updateScroll();
            if (disposed || cancelled) return;
            const frame = relativeFrame(getCoverFrame(target));
            frame.left -= origin.left - viewport.scrollLeft;
            frame.top -= origin.top - viewport.scrollTop;
            if (lastTarget && frame.left === lastTarget.left && frame.top === lastTarget.top
                && frame.width === lastTarget.width && frame.height === lastTarget.height
                && frame.borderRadius === lastTarget.borderRadius) return;
            lastTarget = frame;
            if (completed) {
                controls.set({ ...frame, opacity: 1 });
                return;
            }
            const currentAnimation = ++animation;
            void controls.start({ ...frame, opacity: 1, transition: detailTransition }).then(() => {
                if (disposed || cancelled || animation !== currentAnimation) return;
                completed = true;
                useNavigationStore.getState().completeCoverTransition(coverId, from);
            });
        };
        controls.set({ ...relativeFrame(from), opacity: 1 });
        updateLayout();
        const resize = new ResizeObserver(updateLayout);
        resize.observe(root);
        resize.observe(target);
        const mutation = new MutationObserver(updateLayout);
        mutation.observe(root, { childList: true, subtree: true });
        viewport.addEventListener('scroll', updateScroll, { passive: true });
        window.addEventListener('resize', updateLayout);
        return () => {
            disposed = true;
            controls.stop();
            resize.disconnect();
            mutation.disconnect();
            viewport.removeEventListener('scroll', updateScroll);
            window.removeEventListener('resize', updateLayout);
            if (scrollLayer) scrollLayer.style.translate = '';
            // The outgoing surface retains its last offset until its own exit completes.
        };
    }, [active, coverId, from, to, direction, scroll, controls]);

    useEffect(() => {
        if (!source?.flight?.completed || !source.flight.ready || source.flight.handedOff) return;
        let paintedFrame = 0;
        const settledFrame = requestAnimationFrame(() => {
            paintedFrame = requestAnimationFrame(() => {
                const navigation = useNavigationStore.getState();
                if (navigation.coverTransition?.flight?.from === source.flight?.from) {
                    navigation.finishCoverTransition(source.coverId);
                }
            });
        });
        return () => { cancelAnimationFrame(settledFrame); cancelAnimationFrame(paintedFrame); };
    }, [source]);

    if (!moreTransitionsEnabled || !source?.flight) return null;
    return createPortal(
        <div ref={rootRef} aria-hidden="true" data-cover-transition-active={active ? '' : undefined}
            className="pointer-events-none fixed z-10000 overflow-hidden" style={{ visibility: active ? 'visible' : 'hidden' }}>
            <div ref={scrollRef} className="absolute inset-0">
                <motion.div data-moving-cover={source.coverId} initial={false} animate={controls} className="absolute overflow-hidden">
                    <CoverSnapshot images={source.images} />
                </motion.div>
            </div>
        </div>,
        document.body,
    );
}
