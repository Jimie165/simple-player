import MoreIcon from '@/components/common/MoreIcon';
import QueueSourceLabel from '@/features/player/queue/QueueSourceLabel';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
    DndContext,
    DragOverlay,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type Modifier,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { IoClose } from 'react-icons/io5';
import CoverImage from '@/components/common/CoverImage';
import SongCoverOverlay from '@/components/common/SongCoverOverlay';
import ScrollArea from '@/components/common/ScrollArea';
import LyricsScrollbar from '@/features/player/scrollbar/LyricsScrollbar';
import { navigateFromQueueContext } from '@/features/player/utils/queueContextNavigation';
import { QueueRowMenu, SortableQueueItem } from '@/features/player/queue/SortableQueueItem';
import {
    type QueueEntry,
    getQueueItemId,
    splitQueueEntries,
    VIRTUOSO_OVERSCAN,
} from '@/features/player/queue/queueHelpers';

export interface NowPlayingQueueProps {
    onNavigate?: () => void;
    scrollToTopSignal?: number;
    isOpen?: boolean;
    onUserScrollDirection?: (direction: 'up' | 'down', delta?: number) => void;
    variant?: 'side' | 'narrow' | 'content';
    narrowControlsVisible?: boolean;
    onClose?: () => void;
}

/**
 * 播放队列面板，复用内容区与正在播放页的分区、拖拽和虚拟渲染。
 */
export default function NowPlayingQueue({
    onNavigate,
    scrollToTopSignal,
    isOpen,
    onUserScrollDirection,
    variant = 'side',
    narrowControlsVisible = true,
    onClose,
}: NowPlayingQueueProps) {
    const isContent = variant === 'content';
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
    const lastScrollTopRef = useRef(0);
    const lastScrollRequestRef = useRef<{ isOpen: boolean | undefined; signal: number | undefined } | null>(null);
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [draggedItemWidth, setDraggedItemWidth] = useState<number | undefined>(undefined);
    const {
        playlist,
        currentSongIndex,
        reorderPlaylist,
        queueContext,
        clearUserQueue,
        removeQueueItem
    } = useLibraryStore();
    const { playQueueItem } = usePlaybackActions();
    const currentSong = playlist[currentSongIndex];

    useEffect(() => {
        if (scrollContainerRef.current) {
            setScrollParent(scrollContainerRef.current);
            lastScrollTopRef.current = scrollContainerRef.current.scrollTop;
        }
    }, []);

    useLayoutEffect(() => {
        if (!scrollParent || !virtuosoRef.current) return;
        const previous = lastScrollRequestRef.current;
        lastScrollRequestRef.current = { isOpen, signal: scrollToTopSignal };
        // Activity replays effects when revealed; preserve the retained queue's scroll position.
        if (!isOpen || (previous?.isOpen === isOpen && previous.signal === scrollToTopSignal)) return;
        // 面板仍不可见时由虚拟列表完成一次定位，避免进入动画后再次跳动。
        virtuosoRef.current.scrollToIndex({ index: 0, align: 'start', behavior: 'auto' });
        lastScrollTopRef.current = 0;
    }, [isOpen, scrollParent, scrollToTopSignal]);

    useLayoutEffect(() => {
        if (variant !== 'side' || !scrollParent) return;
        const root = scrollParent.closest<HTMLElement>('[data-now-playing-root]');
        const volume = root?.querySelector<HTMLElement>('[data-player-volume]');
        if (!root || !volume) return;
        let frame: number | null = null;
        let animateUntil = 0;
        const update = () => {
            const viewportRect = scrollParent.getBoundingClientRect();
            const volumeRect = volume.getBoundingClientRect();
            const end = Math.max(0, Math.min(viewportRect.height, viewportRect.bottom - volumeRect.top - volumeRect.height / 2));
            scrollParent.style.setProperty('--queue-mask-end', `${end}px`);
            scrollParent.style.setProperty('--queue-mask-start', `${end + 64}px`);
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
        observer.observe(scrollParent);
        observer.observe(root);
        observer.observe(volume);
        if (volume.parentElement) observer.observe(volume.parentElement);
        update();
        refresh();
        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
            observer.disconnect();
            scrollParent.style.removeProperty('--queue-mask-end');
            scrollParent.style.removeProperty('--queue-mask-start');
        };
    }, [isOpen, scrollParent, variant]);

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );


    // Split Playlist into: 
    // 1. User Queue (is_queue_item = true)
    // 2. Next Up (Context) (is_queue_item = false)
    // filtering only items AFTER currentSongIndex.

    const { queueList, nextFromList } = useMemo(
        () => splitQueueEntries(playlist, currentSongIndex),
        [playlist, currentSongIndex]
    );

    const queueSortableItems = useMemo(() => queueList.map(getQueueItemId), [queueList]);
    const nextFromSortableItems = useMemo(() => nextFromList.map(getQueueItemId), [nextFromList]);
    const allQueueEntries = useMemo(() => [...queueList, ...nextFromList], [queueList, nextFromList]);
    const virtualItems = useMemo(() => {
        const items: Array<
            | { kind: 'user-header' }
            | { kind: 'context-header' }
            | { kind: 'empty' }
            | { kind: 'entry'; entry: QueueEntry }
            | { kind: 'current'; entry: QueueEntry }
        > = [];

        if (isContent && currentSong) {
            items.push({ kind: 'current', entry: { song: currentSong, originalIndex: currentSongIndex } });
        }
        if (queueList.length > 0) {
            items.push({ kind: 'user-header' });
            queueList.forEach((entry) => items.push({ kind: 'entry', entry }));
        }
        items.push({ kind: 'context-header' });
        if (nextFromList.length > 0) {
            nextFromList.forEach((entry) => items.push({ kind: 'entry', entry }));
        } else {
            items.push({ kind: 'empty' });
        }
        return items;
    }, [queueList, nextFromList, isContent, currentSong, currentSongIndex]);

    const allSortableItems = useMemo(
        () => [...queueSortableItems, ...nextFromSortableItems],
        [queueSortableItems, nextFromSortableItems]
    );
    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveDragId(String(event.active.id));
        const initialRect = event.active.rect.current.initial;
        if (initialRect) {
            setDraggedItemWidth(initialRect.width);
        }
    }, []);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragId(null);
        if (over && active.id !== over.id) {
            const oldIndexStr = String(active.id).split('-')[0];
            const newIndexStr = String(over.id).split('-')[0];
            const oldGlobalIndex = parseInt(oldIndexStr);
            const newGlobalIndex = parseInt(newIndexStr);
            reorderPlaylist(oldGlobalIndex, newGlobalIndex);
        }
    };

    const handleDragCancel = useCallback(() => {
        setActiveDragId(null);
    }, []);

    const handlePlay = useCallback((globalIndex: number) => {
        playQueueItem({ song: playlist[globalIndex], index: globalIndex, restartIfCurrent: true });
    }, [playQueueItem, playlist]);

    const handleRemove = useCallback((globalIndex: number) => {
        removeQueueItem(globalIndex);
    }, [removeQueueItem]);

    // Custom modifier to restrict dragging within scroll viewport
    const restrictToQueueViewport: Modifier = ({ transform, draggingNodeRect, containerNodeRect }) => {
        if (!draggingNodeRect || !containerNodeRect) return transform;
        const viewportRect = scrollContainerRef.current?.getBoundingClientRect();
        if (!viewportRect) return transform;

        const draggedTop = draggingNodeRect.top + transform.y;
        const draggedBottom = draggingNodeRect.bottom + transform.y;

        let adjustedY = transform.y;

        if (draggedTop < viewportRect.top) {
            adjustedY = transform.y + (viewportRect.top - draggedTop);
        }

        if (draggedBottom > viewportRect.bottom) {
            adjustedY = transform.y - (draggedBottom - viewportRect.bottom);
        }

        return {
            ...transform,
            y: adjustedY,
        };
    };

    const renderVirtualItem = useCallback((_: number, item: (typeof virtualItems)[number]) => {
        if (item.kind === 'current') {
            return (
                <section className="pb-4">
                    <h3 className="px-2 pt-3 pb-2 text-sm font-bold text-on-surface">当前播放</h3>
                    <div className="group flex items-center gap-3 rounded-md p-2 hover:bg-on-surface/5">
                        <SongCoverOverlay
                            song={item.entry.song}
                            isActive
                            className="h-12 w-12 rounded-sm"
                            onPlay={() => handlePlay(item.entry.originalIndex)}
                        />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium leading-relaxed text-primary">{item.entry.song.title}</div>
                            <div className="truncate text-xs leading-relaxed text-on-surface-variant">{item.entry.song.artist}</div>
                        </div>
                        <div className="p-1 -mr-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <QueueRowMenu
                                song={item.entry.song}
                                appearance="content"
                                onPlay={() => handlePlay(item.entry.originalIndex)}
                                onNavigate={onNavigate}
                            />
                        </div>
                    </div>
                </section>
            );
        }

        if (item.kind === 'user-header') {
            return (
                <div className="h-10 px-[clamp(0.5rem,1.5vw,0.75rem)] flex items-center justify-between">
                    <span className={clsx('font-bold', isContent ? 'text-sm text-on-surface' : 'text-[clamp(0.75rem,1.5vw,0.875rem)] text-white')}>队列中的下一首歌</span>
                    <button
                        onClick={clearUserQueue}
                        className={clsx('font-bold transition-colors', isContent ? 'text-xs text-on-surface-variant hover:text-primary' : 'text-[clamp(0.625rem,1.2vw,0.75rem)] text-white/60 hover:text-white')}
                    >
                        清空队列
                    </button>
                </div>
            );
        }

        if (item.kind === 'context-header') {
            return (
                <div className={clsx('flex items-center gap-1 font-bold', isContent ? 'h-12 px-2 text-sm text-on-surface' : 'h-10 px-[clamp(0.5rem,1.5vw,0.75rem)] text-[clamp(0.75rem,1.5vw,0.875rem)] text-white')}>
                    {queueContext?.type === 'home' ? (
                        <span>下一首</span>
                    ) : (
                        <>
                            <span className={clsx(isContent && 'shrink-0')}>下一首歌来自:</span>
                            <QueueSourceLabel
                                label={queueContext?.name || '播放列表'}
                                blend={!isContent}
                                isOpen={isOpen !== false}
                                onClick={() => navigateFromQueueContext(queueContext, onNavigate)}
                                className={clsx(
                                    'truncate',
                                    isContent ? 'text-on-surface' : 'text-white opacity-45 mix-blend-plus-lighter transition-opacity',
                                    queueContext && 'cursor-pointer hover:underline',
                                    queueContext && (isContent ? 'hover:text-primary' : 'hover:opacity-35 active:opacity-25')
                                )}
                            />
                        </>
                    )}
                </div>
            );
        }

        if (item.kind === 'empty') {
            return <div className={clsx('h-20 flex items-center justify-center', isContent ? 'text-xs text-on-surface-variant' : 'text-white/30 text-[clamp(0.75rem,1.5vw,0.875rem)] italic')}>没有待播放的歌曲</div>;
        }

        return (
            <SortableQueueItem
                song={item.entry.song}
                index={item.entry.originalIndex}
                onPlayIndex={handlePlay}
                onRemoveIndex={handleRemove}
                onNavigate={onNavigate}
                appearance={isContent ? 'content' : 'immersive'}
            />
        );
    }, [clearUserQueue, handlePlay, handleRemove, onNavigate, queueContext, isContent, isOpen]);

    const activeDragEntry = useMemo(() => {
        if (!activeDragId) return null;
        return allQueueEntries.find(entry => getQueueItemId(entry) === activeDragId) || null;
    }, [activeDragId, allQueueEntries]);
    const queueContent = (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            modifiers={[restrictToVerticalAxis, restrictToQueueViewport]}
        >
            <SortableContext
                items={allSortableItems}
                strategy={verticalListSortingStrategy}
            >
                {scrollParent ? (
                    <Virtuoso
                        ref={virtuosoRef}
                        data={virtualItems}
                        defaultItemHeight={isContent ? 68 : 82}
                        itemSize={(element) => element.offsetHeight}
                        customScrollParent={scrollParent}
                        useWindowScroll={false}
                        overscan={VIRTUOSO_OVERSCAN}
                        className="w-full"
                        computeItemKey={(_, item) => {
                            if (item.kind === 'entry') return getQueueItemId(item.entry);
                            return item.kind;
                        }}
                        itemContent={renderVirtualItem}
                    />
                ) : (
                    <div className="flex flex-col opacity-0" />
                )}
            </SortableContext>

            {typeof document !== 'undefined' && createPortal(
                <DragOverlay>
                    {activeDragEntry ? (
                        <div
                            className="pointer-events-none"
                            style={{
                                width: draggedItemWidth ? `${draggedItemWidth}px` : 'auto',
                            }}
                        >
                            <div className={clsx('group flex items-center rounded-md shadow-xl backdrop-blur-sm', isContent ? 'gap-3 p-2 bg-surface-container-high' : 'gap-[clamp(0.5rem,1.5vw,1rem)] px-[clamp(0.5rem,1.5vw,1rem)] py-[clamp(0.375rem,1vw,0.75rem)] bg-white/10')}>
                                <div
                                    className={clsx('relative rounded-sm overflow-hidden shrink-0 bg-neutral-800', isContent && 'w-12 h-12')}
                                    style={isContent ? undefined : { width: 'clamp(2.75rem, 4.25vw, 4.25rem)', height: 'clamp(2.75rem, 4.25vw, 4.25rem)' }}
                                >
                                    <CoverImage thumbnail={128}
song={activeDragEntry.song} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 py-1.5">
                                    <div className={clsx('font-medium truncate leading-[1.4]', isContent ? 'text-sm text-on-surface' : 'text-[clamp(0.75rem,1.5vw,1.125rem)] text-white')}>
                                        {activeDragEntry.song.title}
                                    </div>
                                    <div className={clsx('truncate leading-[1.4]', isContent ? 'text-xs text-on-surface-variant' : 'text-[clamp(0.625rem,1.2vw,0.875rem)] text-white/60')}>
                                        {activeDragEntry.song.artist}
                                    </div>
                                </div>
                                <div className={clsx('w-8 h-8 flex items-center justify-center -mr-2', isContent ? 'text-on-surface-variant' : 'text-white/50')}>
                                    <MoreIcon />
                                </div>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>,
                document.body
            )}

        </DndContext>
    );
    return (
        <div className={clsx('h-full min-h-0 flex flex-col bg-transparent relative overflow-hidden', isContent && 'px-3')}>
            {/* Fixed Top Header Area */}
            <div className={clsx('w-full z-50 shrink-0 flex items-center justify-between', isContent ? 'h-14 px-2' : 'h-[clamp(2.5rem,4.5vw,3.5rem)] px-[clamp(0.5rem,1.5vw,0.75rem)]')}>
                <span className={clsx('font-bold', isContent ? 'border-b-2 border-primary py-2 text-base text-on-surface' : 'text-[clamp(1rem,2vw,1.125rem)] text-white')}>{isContent ? '队列' : '播放队列'}</span>
                {isContent && (
                    <button onClick={onClose} aria-label="关闭播放队列" className="grid h-8 w-8 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface transition-colors">
                        <IoClose className="text-xl" />
                    </button>
                )}
            </div>

            {/* Sortable List */}
            {isContent ? (
                <ScrollArea viewportRef={scrollContainerRef} className="z-10">
                    <div className="pb-6">{queueContent}</div>
                </ScrollArea>
            ) : (
                <div className="relative flex-1 min-h-0">
                    <div
                        ref={scrollContainerRef}
                        data-queue-viewport
                        data-queue-variant={variant}
                        data-controls-visible={narrowControlsVisible}
                        className={clsx(
                            'h-full min-h-0 overflow-y-auto overflow-x-hidden relative z-10 block',
                            variant === 'narrow' ? 'scrollbar-hidden pr-3' : 'immersive-scrollbar queue-immersive-scrollbar',
                            variant === 'narrow'
                                ? (narrowControlsVisible ? 'pb-24' : 'pb-8')
                                : 'pb-24'
                        )}
                        onWheel={variant === 'narrow' ? undefined : (event) => onUserScrollDirection?.(event.deltaY > 0 ? 'down' : 'up', Math.abs(event.deltaY))}
                        onScroll={(event) => {
                            const nextScrollTop = event.currentTarget.scrollTop;
                            const delta = nextScrollTop - lastScrollTopRef.current;
                            if (Math.abs(delta) > 2) {
                                onUserScrollDirection?.(delta > 0 ? 'down' : 'up', Math.abs(delta));
                            }
                            lastScrollTopRef.current = nextScrollTop;
                        }}
                        style={{
                            overflowAnchor: 'none',
                            paddingBottom: variant === 'side'
                                ? 'var(--queue-mask-start, 96px)'
                                : (narrowControlsVisible ? '18rem' : '2rem'),
                            // 渐变遮罩不影响命中测试，裁掉完全透明的区域以阻止隐藏行交互。
                            clipPath: variant === 'narrow'
                                ? (narrowControlsVisible ? 'inset(0 0 min(14.5rem, 100%) 0)' : 'inset(0)')
                                : 'inset(0 0 clamp(0px, var(--queue-mask-end, 32px), 100%) 0)',
                            maskImage: variant === 'narrow'
                                ? (narrowControlsVisible
                                    ? 'linear-gradient(to bottom, black 0%, black calc(100% - 18rem), transparent calc(100% - 14.5rem))'
                                    : 'linear-gradient(to bottom, black 0%, black calc(100% - 1.5rem), transparent 100%)')
                                : 'linear-gradient(to bottom, black calc(100% - var(--queue-mask-start, 96px)), transparent calc(100% - var(--queue-mask-end, 32px)))',
                            WebkitMaskImage: variant === 'narrow'
                                ? (narrowControlsVisible
                                    ? 'linear-gradient(to bottom, black 0%, black calc(100% - 18rem), transparent calc(100% - 14.5rem))'
                                    : 'linear-gradient(to bottom, black 0%, black calc(100% - 1.5rem), transparent 100%)')
                                : 'linear-gradient(to bottom, black calc(100% - var(--queue-mask-start, 96px)), transparent calc(100% - var(--queue-mask-end, 32px)))',
                            transition: 'mask-image 0.3s ease-out, -webkit-mask-image 0.3s ease-out',
                        }}
                    >
                        {queueContent}
                    </div>
                    {variant === 'narrow' && <LyricsScrollbar
                        enabled
                        viewportRef={scrollContainerRef}
                        onUserScroll={delta => onUserScrollDirection?.(delta > 0 ? 'down' : 'up', Math.abs(delta))}
                        style={{
                            bottom: narrowControlsVisible ? '18rem' : '1.5rem',
                            transition: 'bottom 300ms ease-out, opacity 250ms ease',
                        }}
                    />}
                </div>
            )}
        </div>
    );
}
