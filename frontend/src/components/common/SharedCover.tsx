import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useIsPresent } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';
import { detailTransition } from '@/utils/viewTransition';
import type { CoverTransitionFrame, CoverTransitionSource } from '@/utils/viewTransition';
import { useNavigationStore } from '@/store/useNavigationStore';

type SharedCoverProps = Omit<HTMLMotionProps<'div'>, 'children'> & {
    source?: CoverTransitionSource;
    children: ReactNode;
};

/** Carry loaded artwork in both directions until the receiving cover is ready. */
export default function SharedCover({ source, children, className, layoutId, onLayoutAnimationStart, onLayoutAnimationComplete, ...props }: SharedCoverProps) {
    const [ready, setReady] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const decodedImages = useRef(new WeakMap<HTMLImageElement, string>());
    const returnAnimationComplete = useRef(false);
    const receivedFlight = useRef<CoverTransitionFrame | null>(null);
    const isPresent = useIsPresent();
    const coverId = source?.coverId ?? layoutId;
    const returnSource = useNavigationStore(state => {
        const snapshot = state.returnCoverSource;
        return snapshot && snapshot.coverId === coverId && !snapshot.flight?.handedOff
            ? snapshot
            : null;
    });
    const images = returnSource?.images ?? source?.images;
    const showSource = !!images?.length && (!!returnSource || !ready);

    const releaseIfReady = useCallback(() => {
        if (!returnSource) return;
        const loaded = Array.from(contentRef.current?.querySelectorAll('img') ?? []);
        if (!source && isPresent && coverId && returnAnimationComplete.current
            && (!returnSource?.flight || receivedFlight.current === returnSource.flight.from) && loaded.length > 0
            && loaded.every(image => image.complete && image.naturalWidth > 0
                && decodedImages.current.get(image) === image.currentSrc)) {
            useNavigationStore.getState().releaseReturnCover(coverId);
        }
    }, [source, isPresent, coverId, returnSource]);

    const handleImagesLoaded = useCallback(async () => {
        // Ordinary grid cards need no explicit decode or snapshot handoff.
        if (!source && !returnSource) return;
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
        releaseIfReady();
    }, [source, returnSource, releaseIfReady]);

    useLayoutEffect(() => {
        if (!returnSource) return;
        if (returnSource.flight && receivedFlight.current !== returnSource.flight.from) {
            receivedFlight.current = returnSource.flight.from;
            returnAnimationComplete.current = false;
        }
        if (!source && !isPresent && coverId) {
            useNavigationStore.getState().releaseReturnCover(coverId);
            return;
        }
        releaseIfReady();
        // Cached images may already be complete before the return handoff begins.
        void handleImagesLoaded();
    }, [returnSource, source, isPresent, coverId, releaseIfReady, handleImagesLoaded]);

    return (
        <motion.div
            {...props}
            data-transition-cover={coverId}
            data-cover-detail={source ? '' : undefined}
            layoutId={coverId}
            transition={detailTransition}
            onLayoutAnimationStart={() => {
                returnAnimationComplete.current = false;
                onLayoutAnimationStart?.();
            }}
            onLayoutAnimationComplete={() => {
                returnAnimationComplete.current = true;
                releaseIfReady();
                onLayoutAnimationComplete?.();
            }}
            className={clsx('relative', className)}
        >
            <div
                ref={contentRef}
                className="flex h-full w-full items-center justify-center"
                onLoadCapture={handleImagesLoaded}
            >
                {children}
            </div>
            {showSource && (
                <div data-shared-cover-snapshot aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
                    <CoverSnapshot images={images} />
                </div>
            )}
        </motion.div>
    );
}

function CoverSnapshot({ images }: Pick<CoverTransitionSource, 'images'>) {
    return images?.map((image, index) => (
        <img
            key={`${index}:${image.src}`}
            src={image.src}
            alt=""
            loading="eager"
            decoding="sync"
            className="absolute object-cover"
            style={{
                left: `${image.left}%`,
                top: `${image.top}%`,
                width: `${image.width}%`,
                height: `${image.height}%`,
            }}
        />
    ));
}

/** Shared-layout followers can sit behind the opaque exiting page; fly above both page layers. */
export function ReturnCoverOverlay() {
    const source = useNavigationStore(state => state.returnCoverSource);
    useEffect(() => {
        if (!source?.flight?.completed || !source.flight.ready || source.flight.handedOff) return;
        let paintedFrame = 0;
        // Leave the snapshot up until the receiver's final projection has reached a paint.
        const settledFrame = requestAnimationFrame(() => {
            paintedFrame = requestAnimationFrame(() => {
                const navigation = useNavigationStore.getState();
                if (navigation.returnCoverSource?.flight?.from === source.flight?.from) {
                    navigation.finishReturnCoverHandoff(source.coverId);
                }
            });
        });
        return () => {
            cancelAnimationFrame(settledFrame);
            cancelAnimationFrame(paintedFrame);
        };
    }, [source]);
    if (!source?.flight || source.flight.handedOff) return null;

    return createPortal(
        <motion.div
            key={source.coverId}
            aria-hidden="true"
            className="pointer-events-none fixed z-10000 overflow-hidden"
            initial={{ ...source.flight.from }}
            animate={{ ...source.flight.to }}
            transition={detailTransition}
            onAnimationComplete={() => useNavigationStore.getState().completeReturnCoverFlight(source.coverId)}
        >
            <CoverSnapshot images={source.images} />
        </motion.div>,
        document.body,
    );
}
