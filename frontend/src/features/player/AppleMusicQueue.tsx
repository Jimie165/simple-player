import React, { useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type Modifier,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IoPlay, IoEllipsisHorizontal } from 'react-icons/io5';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import type { SongMetadata } from '@/types';
import CoverImage from '@/components/common/CoverImage';
import MusicContextMenu from '@/components/common/MusicContextMenu';
import { useSongOperations } from '@/hooks/menu/useSongOperations';
import { navigateFromQueueContext } from './utils/queueContextNavigation';

interface SongRowProps {
    song: SongMetadata;
    isActive?: boolean;
    onPlay: () => void;
    style?: React.CSSProperties;
    itemRef?: (node: HTMLElement | null) => void;
    dragAttributes?: any;
    dragListeners?: any;
    isDraggable?: boolean;
    onRemove?: () => void; // Callback to remove item
    onNavigate?: () => void; // Callback on navigation
}

const SongRow = React.memo(function SongRow({ song, isActive, onPlay, style, itemRef, dragAttributes, dragListeners, isDraggable, onRemove, onNavigate }: SongRowProps) {
    // Generate menu operations
    const ops = useSongOperations({
        items: [song],
        context: 'queue',
        onDelete: onRemove, // Map remove callback to delete action for queue context
        onNavigate: onNavigate
    });

    return (
        <div
            ref={itemRef}
            style={style}
            {...(isDraggable ? dragAttributes : {})}
            {...(isDraggable ? dragListeners : {})}
            className={clsx(
                "group flex items-center gap-[clamp(0.5rem,1.5vw,0.75rem)] py-[clamp(0.375rem,1vw,0.5rem)] px-[clamp(0.5rem,1.5vw,0.75rem)] rounded-md transition-colors select-none",
                isActive ? "bg-white/10" : "hover:bg-white/5"
            )}
        >
            {/* Cover */}
            <div
                className="relative w-[clamp(2rem,4vw,2.5rem)] h-[clamp(2rem,4vw,2.5rem)] rounded-[4px] overflow-hidden flex-shrink-0 bg-neutral-800 shadow-sm group-hover:shadow-md transition-all cursor-pointer"
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag start when clicking play
                onClick={(e) => {
                    e.stopPropagation();
                    onPlay();
                }}
            >
                <CoverImage song={song} className="w-full h-full object-cover" />
                <div
                    className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <IoPlay className="text-white text-base" />
                </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5 h-full py-1.5 border-b border-white/5 group-last:border-none">
                <div className={clsx(
                    "text-[clamp(0.75rem,1.5vw,0.875rem)] font-medium truncate leading-tight",
                    isActive ? "text-primary" : "text-white/90"
                )}>
                    {song.title}
                </div>
                <div className="text-[clamp(0.625rem,1.2vw,0.75rem)] text-white/50 truncate leading-tight">
                    {song.artist}
                </div>
            </div>

            {/* Context Menu Button */}
            <div
                className="p-1 -mr-2"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <MusicContextMenu
                    groups={ops.menuItems}
                    variant="clean"
                    buttonClassName="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-colors cursor-pointer"
                >
                    <IoEllipsisHorizontal />
                </MusicContextMenu>
            </div>
        </div>
    );
});

function SortableQueueItem({ song, index, isActive, onPlay, onRemove, onNavigate }: { song: SongMetadata; index: number; isActive?: boolean; onPlay: () => void, onRemove?: () => void, onNavigate?: () => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: `${index}-${song.id || song.path}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 'auto',
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none' // Important for pointer events
    };

    return (
        <SongRow
            song={song}
            isActive={isActive}
            onPlay={onPlay}
            style={style}
            itemRef={setNodeRef}
            dragAttributes={attributes}
            dragListeners={listeners}
            isDraggable={true}
            onRemove={onRemove}
            onNavigate={onNavigate}
        />
    );
}

export default function AppleMusicQueue({ onNavigate, scrollToTopSignal, isOpen }: { onNavigate?: () => void; scrollToTopSignal?: number; isOpen?: boolean }) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
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

    const { queueList, nextFromList } = useMemo(() => {
        // Limit the Lookahead to 100 items (similar to Apple Music)
        // This is a direct performance optimization to prevent rendering thousands of items
        const nextItems = playlist.slice(currentSongIndex + 1, currentSongIndex + 1 + 100);
        const queue: { song: SongMetadata; originalIndex: number }[] = [];
        const nextFrom: { song: SongMetadata; originalIndex: number }[] = [];

        nextItems.forEach((song, i) => {
            const originalIndex = currentSongIndex + 1 + i;
            if (song.is_queue_item) {
                queue.push({ song, originalIndex });
            } else {
                nextFrom.push({ song, originalIndex });
            }
        });

        return { queueList: queue, nextFromList: nextFrom };
    }, [playlist, currentSongIndex]);


    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndexStr = String(active.id).split('-')[0];
            const newIndexStr = String(over!.id).split('-')[0];
            const oldGlobalIndex = parseInt(oldIndexStr);
            const newGlobalIndex = parseInt(newIndexStr);
            reorderPlaylist(oldGlobalIndex, newGlobalIndex);
        }
    };

    const handlePlay = (globalIndex: number) => {
        playQueueItem({ song: playlist[globalIndex], index: globalIndex, restartIfCurrent: true });
    };

    // Custom modifier to restrict dragging within scroll viewport
    const restrictToQueueViewport: Modifier = ({ transform, draggingNodeRect, containerNodeRect }) => {
        if (!draggingNodeRect || !containerNodeRect) return transform;

        const viewport = document.querySelector('[data-queue-viewport]');
        if (!viewport) return transform;

        const viewportRect = viewport.getBoundingClientRect();

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

    return (
        <div className="h-full flex flex-col bg-transparent relative overflow-hidden">
            {/* Fixed Top Header Area */}
            <div className="w-full h-[clamp(2.5rem,4.5vw,3.5rem)] z-50 flex-shrink-0 flex items-center justify-between px-[clamp(0.5rem,1.5vw,0.75rem)]">
                <span className="text-[clamp(1rem,2vw,1.125rem)] font-bold text-white">播放队列</span>
            </div>

            {/* Sortable List */}
            <div
                ref={scrollContainerRef}
                data-queue-viewport
                className="flex-1 overflow-y-auto overflow-x-hidden immersive-scrollbar relative z-10 block pb-24"
                style={{
                    overflowAnchor: 'none',
                    maskImage: 'linear-gradient(to bottom, black calc(100% - 96px), transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 96px), transparent 100%)'
                }}
            >
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis, restrictToQueueViewport]}
                >
                    {/* Section 1: User Queue */}
                    {queueList.length > 0 && (
                        <div className="mb-4">
                            <div className="px-[clamp(0.5rem,1.5vw,0.75rem)] py-[clamp(0.375rem,1vw,0.5rem)] flex items-center justify-between">
                                <span className="text-[clamp(0.75rem,1.5vw,0.875rem)] font-bold text-white">队列中的下一首歌</span>
                                <button
                                    onClick={clearUserQueue}
                                    className="text-[clamp(0.625rem,1.2vw,0.75rem)] font-bold text-white/60 hover:text-white transition-colors"
                                >
                                    清空队列
                                </button>
                            </div>
                            <SortableContext items={queueList.map(item => `${item.originalIndex}-${item.song.id || item.song.path}`)} strategy={verticalListSortingStrategy}>
                                <div className="flex flex-col">
                                    {queueList.map((item) => (
                                        <SortableQueueItem
                                            key={`${item.originalIndex}-${item.song.id || item.song.path}`}
                                            song={item.song}
                                            index={item.originalIndex}
                                            onPlay={() => handlePlay(item.originalIndex)}
                                            onRemove={() => removeQueueItem(item.originalIndex)}
                                            onNavigate={onNavigate}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </div>
                    )}

                    {/* Section 2: Next From Context */}
                    {/* Section 2: Next From Context */}
                    {/* Section 2: Next From Context */}
                    <div className="px-[clamp(0.5rem,1.5vw,0.75rem)] py-[clamp(0.375rem,1vw,0.5rem)] flex items-center gap-1 text-[clamp(0.75rem,1.5vw,0.875rem)] font-bold text-white">
                        {queueContext?.type === 'home' ? (
                            <span>下一首</span>
                        ) : (
                            <>
                                <span>下一首歌来自:</span>
                                <span
                                    onClick={() => navigateFromQueueContext(queueContext, onNavigate)}
                                    className={clsx(
                                        "truncate text-white/70 transition-colors",
                                        queueContext && "hover:text-primary cursor-pointer hover:underline"
                                    )}
                                >
                                    {queueContext?.name || "播放列表"}
                                </span>
                            </>
                        )}
                    </div>

                    <SortableContext items={nextFromList.map(item => `${item.originalIndex}-${item.song.id || item.song.path}`)} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col min-h-[100px]">
                            {nextFromList.length === 0 && queueList.length === 0 && (<div className="text-white/30 py-8 text-[clamp(0.75rem,1.5vw,0.875rem)] text-center italic">没有待播放的歌曲</div>)}
                            {nextFromList.map((item) => (
                                <SortableQueueItem
                                    key={`${item.originalIndex}-${item.song.id || item.song.path}`}
                                    song={item.song}
                                    index={item.originalIndex}
                                    onPlay={() => handlePlay(item.originalIndex)}
                                    onRemove={() => removeQueueItem(item.originalIndex)}
                                    onNavigate={onNavigate}
                                />
                            ))}
                        </div>
                    </SortableContext>

                </DndContext>
            </div>
        </div>
    );
}
