import {
    memo,
    useCallback,
    useEffect,
    useInsertionEffect,
    useLayoutEffect,
    useRef,
    useSyncExternalStore,
    type ReactNode,
    type RefObject,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import clsx from 'clsx';
import InterludeItem from '@/features/player/lyrics/InterludeItem';
import LyricsLineItem from '@/features/player/lyrics/LyricsLineItem';
import {
    interludeGapOpenDurationMs,
    interludeNextLineFocusLeadMs,
} from '@/features/player/lyrics/constants';
import type { DisplayItem } from '@/features/player/lyrics/types';
import type { LyricsLine } from '@/types';
import { getLineEndMsByIndex } from '@/features/player/lyrics/lyricsDisplay';
import type { LyricsVisibilityStore } from '@/features/player/lyrics/lyricsVisibilityStore';

interface MountedRow {
    shell: HTMLDivElement;
    root: Root;
    unregisterAnimator: (() => void) | undefined;
    unregisterMeasure: (() => void) | undefined;
    lastRenderSignature: string | null;
    lastRenderedItems: DisplayItem[] | null;
    lastRenderedItem: DisplayItem | null;
}

interface MountedLyricsRowProps {
    children: ReactNode;
    onReady: () => void;
    registrationKey: object;
}

/**
 * Registers a row after its independent React root has committed. The parent
 * lyrics panel therefore never has to reconcile the complete visible row list.
 */
function MountedLyricsRow({ children, onReady, registrationKey }: MountedLyricsRowProps) {
    const onReadyRef = useRef(onReady);
    useInsertionEffect(() => {
        onReadyRef.current = onReady;
    }, [onReady]);
    useLayoutEffect(() => {
        onReadyRef.current();
    }, [registrationKey]);
    return children;
}

interface FluidLyricsDomRendererProps {
    hostRef: RefObject<HTMLDivElement | null>;
    visibilityStore: LyricsVisibilityStore;
    displayItems: DisplayItem[];
    itemTops: readonly number[];
    itemHeights: readonly number[];
    contentHeight: number;
    activeDisplayIndex: number;
    activeIndices: Set<number>;
    parentDisplayIndexMap: Map<number, number>;
    focusNextLineByVisualEnd: boolean;
    renderCurrentMs: number;
    preciseMsRef: RefObject<number>;
    isUserScrolling: boolean;
    pausedScroll: boolean;
    interludeExitKey: number;
    exitingInterludeIndex: number | null;
    playbackSyncKey: number;
    interludeShiftDurationMs: number;
    lines: LyricsLine[];
    enableTightHandoffTailCompression: boolean;
    onSeek: (time: number) => void;
    registerAnimatedRow: (index: number, node: HTMLDivElement) => (() => void) | undefined;
    observeItem: (index: number, node: HTMLDivElement) => () => void;
    visualInterludeShifts: readonly number[];
    motionDelays: readonly number[];
    variant: 'side' | 'narrow';
    hasDuetLine: boolean;
    cachedRowHeights: readonly (number | null)[];
    reportBackgroundHeight: (displayIndex: number, height: number) => void;
}

const getRowKey = (item: DisplayItem) => item.type === 'line'
    ? `line-${item.lineIndex}`
    : `interlude-${item.afterLineIndex}-${item.startMs}`;

/**
 * Imperative spatial row host. React still owns each row's content and hooks,
 * but row creation/removal no longer causes the parent panel to reconcile a
 * large `visibleIndices.map(...)` subtree during a transition.
 */
function FluidLyricsDomRenderer({
    hostRef,
    visibilityStore,
    displayItems,
    itemTops,
    itemHeights,
    contentHeight,
    activeDisplayIndex,
    activeIndices,
    parentDisplayIndexMap,
    focusNextLineByVisualEnd,
    renderCurrentMs,
    preciseMsRef,
    isUserScrolling,
    pausedScroll,
    interludeExitKey,
    exitingInterludeIndex,
    playbackSyncKey,
    interludeShiftDurationMs,
    lines,
    enableTightHandoffTailCompression,
    onSeek,
    registerAnimatedRow,
    observeItem,
    visualInterludeShifts,
    motionDelays,
    variant,
    hasDuetLine,
    cachedRowHeights,
    reportBackgroundHeight,
}: FluidLyricsDomRendererProps) {
    const visibleIndices = useSyncExternalStore(
        visibilityStore.subscribe,
        visibilityStore.getSnapshot,
        visibilityStore.getSnapshot,
    );
    const mountedRowsRef = useRef(new Map<number, MountedRow>());
    const latestPropsRef = useRef<FluidLyricsDomRendererProps | null>(null);

    useInsertionEffect(() => {
        latestPropsRef.current = {
            hostRef,
            visibilityStore,
            displayItems,
            itemTops,
            itemHeights,
            contentHeight,
            activeDisplayIndex,
            activeIndices,
            parentDisplayIndexMap,
            focusNextLineByVisualEnd,
            renderCurrentMs,
            preciseMsRef,
            isUserScrolling,
            pausedScroll,
            interludeExitKey,
            exitingInterludeIndex,
            playbackSyncKey,
            interludeShiftDurationMs,
            lines,
            enableTightHandoffTailCompression,
            onSeek,
            registerAnimatedRow,
            observeItem,
            visualInterludeShifts,
            motionDelays,
            variant,
            hasDuetLine,
            cachedRowHeights,
            reportBackgroundHeight,
        };
    }, [activeDisplayIndex, activeIndices, cachedRowHeights, contentHeight, displayItems, enableTightHandoffTailCompression, exitingInterludeIndex, focusNextLineByVisualEnd, hasDuetLine, hostRef, interludeExitKey, interludeShiftDurationMs, isUserScrolling, itemTops, lines, motionDelays, observeItem, onSeek, parentDisplayIndexMap, pausedScroll, playbackSyncKey, preciseMsRef, registerAnimatedRow, renderCurrentMs, reportBackgroundHeight, variant, visualInterludeShifts, visibilityStore]);

    const unmountRow = useCallback((index: number) => {
        const mounted = mountedRowsRef.current.get(index);
        if (!mounted) return;
        mountedRowsRef.current.delete(index);
        mounted.unregisterAnimator?.();
        mounted.unregisterMeasure?.();
        mounted.root.unmount();
        mounted.shell.remove();
    }, []);

    const renderRow = useCallback((index: number, mounted: MountedRow) => {
        const props = latestPropsRef.current;
        const item = props?.displayItems[index];
        if (!props || !item) return;
        mounted.shell.dataset.fluidLyricsRowKey = getRowKey(item);
        const isActive = props.activeIndices.has(index);
        const effectiveIndex = props.parentDisplayIndexMap.get(index) ?? index;
        const distanceFromActive = props.activeDisplayIndex >= 0
            ? Math.abs(props.activeDisplayIndex - effectiveIndex)
            : 0;
        const isKaraokeActive = item.type === 'line' && item.line.words?.length
            ? isActive || (
                props.focusNextLineByVisualEnd &&
                typeof item.line.visual_end_ms === 'number' &&
                typeof item.line.end_time_ms === 'number' &&
                item.line.visual_end_ms < item.line.end_time_ms &&
                props.renderCurrentMs >= item.line.visual_end_ms &&
                props.renderCurrentMs < item.line.end_time_ms
            )
            : isActive;
        const renderSignature = item.type === 'interlude'
            ? (() => {
                const animationEndMs = Math.max(
                    item.startMs,
                    item.endMs - interludeNextLineFocusLeadMs,
                );
                const isWithinAnimationWindow =
                    props.renderCurrentMs >= item.startMs &&
                    props.renderCurrentMs < animationEndMs;
                const canAnimateDots =
                    isWithinAnimationWindow &&
                    props.renderCurrentMs >= item.startMs + interludeGapOpenDurationMs;
                // InterludeItem reads the precise clock from preciseMsRef on
                // every content frame. Only rerender its React shell when a
                // boundary boolean or an explicit exit/sync key changes.
                return [
                    'interlude',
                    isActive,
                    props.exitingInterludeIndex === index,
                    props.interludeExitKey,
                    props.playbackSyncKey,
                    isWithinAnimationWindow,
                    canAnimateDots,
                ].join('|');
            })()
            : [
                'line',
                isActive,
                isKaraokeActive,
                distanceFromActive,
                item.line.words?.length ? 0 : props.motionDelays[index] ?? 0,
                props.hasDuetLine,
                props.cachedRowHeights[index] ?? 0,
            ].join('|');
        // The same display index can be reused when a new song is loaded. The
        // visual flags may happen to match the previous song, but the row
        // content and its timing model are different and must still be
        // committed to this independent React root.
        if (
            mounted.lastRenderedItems === props.displayItems &&
            mounted.lastRenderedItem === item &&
            mounted.lastRenderSignature === renderSignature
        ) return;
        mounted.lastRenderedItems = props.displayItems;
        mounted.lastRenderedItem = item;
        mounted.lastRenderSignature = renderSignature;

        const content = item.type === 'interlude' ? (
            <div>
                <InterludeItem
                    isActive={isActive}
                    forceExiting={index === props.exitingInterludeIndex}
                    forceExitKey={props.interludeExitKey}
                    playbackSyncKey={props.playbackSyncKey}
                    suppressDots={false}
                    currentMs={props.renderCurrentMs}
                    preciseMsRef={props.preciseMsRef}
                    startMs={item.startMs}
                    endMs={item.endMs}
                />
            </div>
        ) : (
            <LyricsLineItem
                line={item.line}
                isActive={isActive}
                isKaraokeActive={isKaraokeActive}
                isUserScrolling={props.isUserScrolling}
                pausedScroll={props.pausedScroll}
                distanceFromActive={distanceFromActive}
                interludeShift={props.visualInterludeShifts[index] ?? 0}
                interludeShiftDurationMs={props.interludeShiftDurationMs}
                lineEndMs={typeof item.line.end_time_ms === 'number'
                    ? item.line.end_time_ms
                    : getLineEndMsByIndex(props.lines, item.lineIndex)}
                nextLineStartMs={item.line.words?.length
                    ? getLineEndMsByIndex(props.lines, item.lineIndex)
                    : null}
                enableTightHandoffTailCompression={props.enableTightHandoffTailCompression}
                currentTime={props.renderCurrentMs / 1000}
                preciseMsRef={props.preciseMsRef}
                onSeek={props.onSeek}
                fluidMotion
                motionDelay={props.motionDelays[index] ?? 0}
                variant={props.variant}
                isBackground={item.line.role === 'background'}
                hasDuetLine={props.hasDuetLine}
                cachedRowHeight={props.cachedRowHeights[index]}
                onBackgroundHeight={
                    item.line.role === 'background'
                        ? (height: number) => props.reportBackgroundHeight(index, height)
                        : undefined
                }
            />
        );

        mounted.root.render(
            <MountedLyricsRow registrationKey={props.displayItems} onReady={() => {
                if (mountedRowsRef.current.get(index) !== mounted) return;
                mounted.unregisterAnimator?.();
                mounted.unregisterMeasure?.();
                // min-height only protects the shell while this independent
                // React root is empty. Keeping it after commit prevents a row
                // from shrinking when a wider viewport removes a text wrap.
                mounted.shell.style.removeProperty('min-height');
                mounted.unregisterAnimator = props.registerAnimatedRow(index, mounted.shell);
                mounted.unregisterMeasure = props.observeItem(index, mounted.shell);
            }}>
                {content}
            </MountedLyricsRow>
        );
    }, []);

    const mountRow = useCallback((index: number) => {
        const props = latestPropsRef.current;
        const host = props?.hostRef.current;
        const item = props?.displayItems[index];
        if (!props || !host || !item || mountedRowsRef.current.has(index)) return;

        const shell = document.createElement('div');
        shell.className = clsx('fluid-lyrics-row-shell absolute left-0 w-full');
        shell.style.top = `${props.itemTops[index] ?? 0}px`;
        // The independent React root commits asynchronously. Keep the shell
        // in the spatial model with its estimated/cached height until the
        // batched ResizeObserver measurement supplies the real height.
        shell.style.minHeight = `${props.itemHeights[index] ?? 0}px`;
        shell.dataset.fluidLyricsRowKey = getRowKey(item);
        const nextMountedShell = [...mountedRowsRef.current.entries()]
            .sort(([left], [right]) => left - right)
            .find(([mountedIndex]) => mountedIndex > index)?.[1].shell;
        host.insertBefore(shell, nextMountedShell ?? null);
        const mounted: MountedRow = {
            shell,
            root: createRoot(shell),
            unregisterAnimator: undefined,
            unregisterMeasure: undefined,
            lastRenderSignature: null,
            lastRenderedItems: null,
            lastRenderedItem: null,
        };
        mountedRowsRef.current.set(index, mounted);
        renderRow(index, mounted);
    }, [renderRow]);

    useLayoutEffect(() => {
        const desired = new Set(visibleIndices);
        mountedRowsRef.current.forEach((_mounted, index) => {
            if (!desired.has(index)) unmountRow(index);
        });
        visibleIndices.forEach(index => mountRow(index));
    }, [mountRow, unmountRow, visibleIndices]);

    useLayoutEffect(() => {
        mountedRowsRef.current.forEach((mounted, index) => {
            mounted.shell.style.top = `${itemTops[index] ?? 0}px`;
            renderRow(index, mounted);
        });
    }, [activeDisplayIndex, activeIndices, cachedRowHeights, displayItems, exitingInterludeIndex, focusNextLineByVisualEnd, interludeExitKey, interludeShiftDurationMs, itemHeights, itemTops, lines, motionDelays, parentDisplayIndexMap, pausedScroll, playbackSyncKey, renderCurrentMs, renderRow, visualInterludeShifts, isUserScrolling]);

    useEffect(() => () => {
        mountedRowsRef.current.forEach((_mounted, index) => unmountRow(index));
    }, [unmountRow]);

    return <div ref={hostRef} className="relative" style={{ height: contentHeight }} />;
}

export default memo(FluidLyricsDomRenderer);
