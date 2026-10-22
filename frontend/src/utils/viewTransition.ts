import type { HTMLMotionProps, Transition } from 'framer-motion';

export const viewTransition: Transition = {
    type: 'tween',
    duration: 0.24,
    ease: [0.22, 1, 0.36, 1],
};

// Tab changes replace content without moving the surrounding chrome.
export const viewMotion = {
    initial: { opacity: 0 },
    animate: { opacity: 1, pointerEvents: 'auto' },
    exit: { opacity: 0, pointerEvents: 'none', transition: { duration: 0.16 } },
    transition: viewTransition,
} satisfies HTMLMotionProps<'div'>;

export const pageMotion = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, pointerEvents: 'auto' },
    exit: { opacity: 0, y: -20, pointerEvents: 'none' },
    transition: { duration: 0.2, ease: 'easeOut' },
} satisfies HTMLMotionProps<'div'>;

export const detailTransition: Transition = {
    type: 'tween',
    duration: 0.4,
    ease: [0.22, 1, 0.36, 1],
};

const legacyDetailTransition: Transition = { type: 'spring', stiffness: 300, damping: 30 };

export interface CoverTransitionFrame {
    left: number;
    top: number;
    width: number;
    height: number;
    borderRadius: number;
}

export interface CoverTransitionSource {
    coverId: string;
    top: number;
    right: number;
    bottom: number;
    left: number;
    frame?: CoverTransitionFrame;
    images?: {
        src: string;
        left: number;
        top: number;
        width: number;
        height: number;
    }[];
    flight?: {
        direction: 'enter' | 'return';
        from: CoverTransitionFrame;
        to: CoverTransitionFrame;
        scroll?: { top: number; left: number };
        completed?: boolean;
        ready?: boolean;
        clipPath?: string;
        handedOff?: boolean;
    };
}

/** Capture the clicked cover before navigation, in content-viewport percentages. */
export function getCoverTransitionSource(card: HTMLElement, visualCover?: HTMLElement): CoverTransitionSource | undefined {
    const cover = visualCover ?? (card.matches('[data-transition-cover]')
        ? card
        : card.querySelector<HTMLElement>('[data-transition-cover]'));
    const viewport = card.closest<HTMLElement>('[data-main-content-query]');
    const coverId = cover?.dataset.transitionCover ?? cover?.dataset.movingCover;
    if (!cover || !coverId || !viewport) return;
    const bounds = cover.getBoundingClientRect();
    const container = viewport.getBoundingClientRect();
    if (container.width <= 0 || container.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return;
    const percent = (value: number) => Math.max(0, Math.min(100, value * 100));
    return {
        coverId,
        frame: getCoverFrame(cover),
        top: percent((bounds.top - container.top) / container.height),
        right: percent((container.right - bounds.right) / container.width),
        bottom: percent((container.bottom - bounds.bottom) / container.height),
        left: percent((bounds.left - container.left) / container.width),
        images: Array.from((cover.querySelector('[data-shared-cover-snapshot]') ?? cover).querySelectorAll('img'))
            .filter(image => image.complete && image.naturalWidth > 0 && image.currentSrc)
            .map(image => {
                const imageBounds = image.getBoundingClientRect();
                return {
                    src: image.currentSrc,
                    left: (imageBounds.left - bounds.left) / bounds.width * 100,
                    top: (imageBounds.top - bounds.top) / bounds.height * 100,
                    width: imageBounds.width / bounds.width * 100,
                    height: imageBounds.height / bounds.height * 100,
                };
            }),
    };
}

export function getCoverFrame(element: HTMLElement): CoverTransitionFrame {
    const bounds = element.getBoundingClientRect();
    const radius = getComputedStyle(element).borderTopLeftRadius;
    const size = Math.min(bounds.width, bounds.height);
    const value = Number.parseFloat(radius) || 0;
    return {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        borderRadius: Math.min(size / 2, radius.endsWith('%') ? size * value / 100 : value),
    };
}

/** Capture native cover bounds and loaded artwork before navigation removes the detail. */
export function captureReturnCover(source?: CoverTransitionSource): CoverTransitionSource | null {
    if (!source || typeof document === 'undefined') return null;
    const covers = Array.from(document.querySelectorAll<HTMLElement>('[data-transition-cover]'))
        .filter(element => element.dataset.transitionCover === source.coverId);
    const detail = covers.find(element => element.hasAttribute('data-cover-detail'));
    if (!detail) return null;
    const movingCover = Array.from(document.querySelectorAll<HTMLElement>('[data-moving-cover]'))
        .find(element => element.dataset.movingCover === source.coverId
            && element.closest('[data-cover-transition-active]')
            && getComputedStyle(element).visibility !== 'hidden');
    const snapshot = getCoverTransitionSource(detail, movingCover);
    if (!snapshot?.images?.length || !snapshot.frame) return null;

    const target = covers.find(element => !element.hasAttribute('data-cover-detail'));
    let destination = snapshot.frame;
    if (target) {
        const frame = getCoverFrame(target);
        if (frame.width > 0 && frame.height > 0) destination = frame;
    }
    if (!destination) return null;
    snapshot.flight = { direction: 'return', from: snapshot.frame, to: destination, ready: !target };
    const scrollViewport = target?.closest<HTMLElement>('[data-scroll-viewport]');
    if (scrollViewport) {
        snapshot.flight.scroll = { top: scrollViewport.scrollTop, left: scrollViewport.scrollLeft };
    }
    const viewport = detail.closest<HTMLElement>('[data-main-content-query]')?.getBoundingClientRect();
    if (viewport && viewport.width > 0 && viewport.height > 0) {
        const percent = (value: number) => Math.max(0, Math.min(100, value * 100));
        const top = percent((destination.top - viewport.top) / viewport.height);
        const right = percent((viewport.right - destination.left - destination.width) / viewport.width);
        const bottom = percent((viewport.bottom - destination.top - destination.height) / viewport.height);
        const left = percent((destination.left - viewport.left) / viewport.width);
        snapshot.flight.clipPath = `inset(${top}% ${right}% ${bottom}% ${left}% round ${destination.borderRadius}px)`;
    }
    return snapshot;
}

export function getDetailMotion(source?: CoverTransitionSource, returnSource?: CoverTransitionSource | null, moreTransitionsEnabled = true) {
    if (!moreTransitionsEnabled) {
        const clipPath = 'inset(0% 0% 0% 0% round 0px)';
        return {
            initial: { x: '100%', clipPath },
            animate: { x: '0%', clipPath },
            exit: { x: '100%', clipPath, transition: legacyDetailTransition },
            transition: legacyDetailTransition,
        };
    }
    // Match the source silhouette so circular avatars don't reveal rectangular page corners.
    const radius = source?.frame?.borderRadius ?? 16;
    const closed = source
        ? { x: '0%', clipPath: `inset(${source.top}% ${source.right}% ${source.bottom}% ${source.left}% round ${radius}px)` }
        : { x: '100%', clipPath: 'inset(0% 0% 0% 0% round 0px)' };
    return {
        initial: closed,
        animate: { x: '0%', clipPath: 'inset(0% 0% 0% 0% round 0px)' },
        exit: source && returnSource?.coverId === source.coverId && returnSource.flight?.direction === 'return' && returnSource.flight.clipPath
            ? { x: '0%', clipPath: returnSource.flight.clipPath }
            : closed,
        transition: detailTransition,
    };
}
