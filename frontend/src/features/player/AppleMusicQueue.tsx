import React, { useEffect, useMemo, useRef, useState, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Virtuoso, type Components } from 'react-virtuoso';
import {
    DndContext,
    DragOverlay,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
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
    type SortableContextProps,
} from '@dnd-kit/sortable';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { IoEllipsisHorizontal } from 'react-icons/io5';
import CoverImage from '@/components/common/CoverImage';
import { navigateFromQueueContext } from '@/features/player/utils/queueContextNavigation';
import { SortableQueueItem } from '@/features/player/queue/SortableQueueItem';
import {
    type QueueEntry,
    getQueueItemId,
    splitQueueEntries,
    VIRTUOSO_OVERSCAN,
} from '@/features/player/queue/queueHelpers';

export interface AppleMusicQueueProps {
    onNavigate?: () => void;
    scrollToTopSignal?: number;
    isOpen?: boolean;
    onUserScrollDirection?: (direction: 'up' | 'down', delta?: number) => void;
    variant?: 'side' | 'narrow';
    narrowControlsVisible?: boolean;
}

function createSortableList(items: string[]) {
    return forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function SortableList(
        { children, ...props },
        ref
    ) {
        return (
            <SortableContext
                items={items as SortableContextProps['items']}
                strategy={verticalListSortingStrategy}
            >
                <div ref={ref} {...props}>{children}</div>
            </SortableContext>
        );
    });
}

/**
 * Apple 风格播放队列面板，负责队列分区、拖拽与虚拟渲染编排。
 */
export default function AppleMusicQueue({
    onNavigate,
    scrollToTopSignal,
    isOpen,
    onUserScrollDirection,
    variant = 'side',
    narrowControlsVisible = true,
}: AppleMusicQueueProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const lastScrollTopRef = useRef(0);
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

    useEffect(() => {
        if (scrollContainerRef.current) {
            setScrollParent(scrollContainerRef.current);
            lastScrollTopRef.current = scrollContainerRef.current.scrollTop;
        }
    }, []);

    useEffect(() => {
        if (!scrollContainerRef.current) return;
        if (!isOpen) return;
        const el = scrollContainerRef.current;
        const scrollNow = () => {
            el.scrollTop = 0;
        };
        scrollNow();
        const rafId = window.requestAnimationFrame(scrollNow);
        const timeoutId = window.setTimeout(scrollNow, 550);
        return () => {
            window.cancelAnimationFrame(rafId);
            window.clearTimeout(timeoutId);
        };
    }, [scrollToTopSignal, isOpen]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
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
        > = [];

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
    }, [queueList, nextFromList]);

    const allSortableItems = useMemo(
        () => [...queueSortableItems, ...nextFromSortableItems],
        [queueSortableItems, nextFromSortableItems]
    );
    const QueueVirtuosoList = useMemo(() => createSortableList(allSortableItems), [allSortableItems]);


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
        if (active.id !== over?.id) {
            const oldIndexStr = String(active.id).split('-')[0];
            const newIndexStr = String(over!.id).split('-')[0];
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
        if (item.kind === 'user-header') {
            return (
                <div className="h-10 px-[clamp(0.5rem,1.5vw,0.75rem)] flex items-center justify-between">
                    <span className="text-[clamp(0.75rem,1.5vw,0.875rem)] font-bold text-white">队列中的下一首歌</span>
                    <button
                        onClick={clearUserQueue}
                        className="text-[clamp(0.625rem,1.2vw,0.75rem)] font-bold text-white/60 hover:text-white transition-colors"
                    >
                        清空队列
                    </button>
                </div>
            );
        }

        if (item.kind === 'context-header') {
            return (
                <div className="h-10 px-[clamp(0.5rem,1.5vw,0.75rem)] flex items-center gap-1 text-[clamp(0.75rem,1.5vw,0.875rem)] font-bold text-white">
                    {queueContext?.type === 'home' ? (
                        <span>下一首</span>
                    ) : (
                        <>
                            <span>下一首歌来自:</span>
                            <span
                                onClick={() => navigateFromQueueContext(queueContext, onNavigate)}
                                className={clsx(
                                    'truncate text-white/70 transition-colors',
                                    queueContext && 'hover:text-primary cursor-pointer hover:underline'
                                )}
                            >
                                {queueContext?.name || '播放列表'}
                            </span>
                        </>
                    )}
                </div>
            );
        }

        if (item.kind === 'empty') {
            return <div className="h-20 flex items-center justify-center text-white/30 text-[clamp(0.75rem,1.5vw,0.875rem)] italic">没有待播放的歌曲</div>;
        }

        return (
            <SortableQueueItem
                song={item.entry.song}
                index={item.entry.originalIndex}
                onPlayIndex={handlePlay}
                onRemoveIndex={handleRemove}
                onNavigate={onNavigate}
            />
        );
    }, [clearUserQueue, handlePlay, handleRemove, onNavigate, queueContext]);

    const activeDragEntry = useMemo(() => {
        if (!activeDragId) return null;
        return allQueueEntries.find(entry => getQueueItemId(entry) === activeDragId) || null;
    }, [activeDragId, allQueueEntries]);
    return (
        <div className="h-full flex flex-col bg-transparent relative overflow-hidden">
            {/* Fixed Top Header Area */}
            <div className="w-full h-[clamp(2.5rem,4.5vw,3.5rem)] z-50 shrink-0 flex items-center justify-between px-[clamp(0.5rem,1.5vw,0.75rem)]">
                <span className="text-[clamp(1rem,2vw,1.125rem)] font-bold text-white">播放队列</span>
            </div>

            {/* Sortable List */}
            <div
                ref={scrollContainerRef}
                data-queue-viewport
                className={clsx(
                    'flex-1 overflow-y-auto overflow-x-hidden immersive-scrollbar relative z-10 block',
                    variant === 'narrow'
                        ? (narrowControlsVisible ? 'pb-24' : 'pb-8')
                        : 'pb-24'
                )}
                onWheel={(event) => onUserScrollDirection?.(event.deltaY > 0 ? 'down' : 'up', Math.abs(event.deltaY))}
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
                    maskImage: variant === 'narrow'
                        ? (narrowControlsVisible
                            ? 'linear-gradient(to bottom, black calc(100% - 96px), transparent 100%)'
                            : 'linear-gradient(to bottom, black calc(100% - 20px), transparent 100%)')
                        : 'linear-gradient(to bottom, black calc(100% - 96px), transparent 100%)',
                    WebkitMaskImage: variant === 'narrow'
                        ? (narrowControlsVisible
                            ? 'linear-gradient(to bottom, black calc(100% - 96px), transparent 100%)'
                            : 'linear-gradient(to bottom, black calc(100% - 20px), transparent 100%)')
                        : 'linear-gradient(to bottom, black calc(100% - 96px), transparent 100%)',
                }}
            >
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                    modifiers={[restrictToVerticalAxis, restrictToQueueViewport]}
                >
                    {scrollParent ? (
                        <Virtuoso
                            data={virtualItems}
                            customScrollParent={scrollParent}
                            useWindowScroll={false}
                            overscan={VIRTUOSO_OVERSCAN}
                            className="w-full"
                            components={{ List: QueueVirtuosoList as Components['List'] }}
                            computeItemKey={(_, item) => {
                                if (item.kind === 'entry') return getQueueItemId(item.entry);
                                return item.kind;
                            }}
                            itemContent={renderVirtualItem}
                        />
                    ) : (
                        <div className="flex flex-col opacity-0" />
                    )}

                    {typeof document !== 'undefined' && createPortal(
                        <DragOverlay>
                            {activeDragEntry ? (
                                <div
                                    className="pointer-events-none"
                                    style={{
                                        width: draggedItemWidth ? `${draggedItemWidth}px` : 'auto',
                                    }}
                                >
                                    <div className="group flex items-center gap-[clamp(0.5rem,1.5vw,1rem)] px-[clamp(0.5rem,1.5vw,1rem)] py-[clamp(0.375rem,1vw,0.75rem)] bg-white/10 rounded-md shadow-xl backdrop-blur-sm">
                                        <div
                                            className="relative rounded-sm overflow-hidden shrink-0 bg-neutral-800"
                                            style={{ width: 'clamp(2.75rem, 4.25vw, 4.25rem)', height: 'clamp(2.75rem, 4.25vw, 4.25rem)' }}
                                        >
                                            <CoverImage thumbnail={128}
song={activeDragEntry.song} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 py-1.5">
                                            <div className="text-[clamp(0.75rem,1.5vw,1.125rem)] font-medium text-white truncate leading-[1.4]">
                                                {activeDragEntry.song.title}
                                            </div>
                                            <div className="text-[clamp(0.625rem,1.2vw,0.875rem)] text-white/60 truncate leading-[1.4]">
                                                {activeDragEntry.song.artist}
                                            </div>
                                        </div>
                                        <div className="w-8 h-8 flex items-center justify-center text-white/50 -mr-2">
                                            <IoEllipsisHorizontal />
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </DragOverlay>,
                        document.body
                    )}

                </DndContext>
            </div>
        </div>
    );
}
