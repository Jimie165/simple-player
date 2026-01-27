import { useMemo } from 'react';
import clsx from 'clsx';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
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
import { useLibraryStore } from '../../store/useLibraryStore';
import { useNavigationStore } from '../../store/useNavigationStore';
import { usePlaybackActions } from '../../hooks/usePlaybackActions';
import type { SongMetadata } from '../../types';
import CoverImage from '../../components/common/CoverImage';
import MusicContextMenu from '../../components/common/MusicContextMenu';
import { useSongOperations } from '../../hooks/useSongOperations';

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

function SongRow({ song, isActive, onPlay, style, itemRef, dragAttributes, dragListeners, isDraggable, onRemove, onNavigate }: SongRowProps) {
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
                "group flex items-center gap-3 py-2 px-3 rounded-md transition-colors select-none",
                isActive ? "bg-white/10" : "hover:bg-white/5"
            )}
        >
            {/* Cover */}
            <div
                className="relative w-10 h-10 rounded-[4px] overflow-hidden flex-shrink-0 bg-neutral-800 shadow-sm group-hover:shadow-md transition-all cursor-pointer"
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
                    "text-sm font-medium truncate leading-tight",
                    isActive ? "text-primary" : "text-white/90"
                )}>
                    {song.title}
                </div>
                <div className="text-xs text-white/50 truncate leading-tight">
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
}

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

export default function AppleMusicQueue({ onNavigate }: { onNavigate?: () => void }) {
    const {
        playlist,
        currentSongIndex,
        reorderPlaylist,
        queueContext,
        clearUserQueue,
        removeQueueItem
    } = useLibraryStore();
    const { playQueueItem } = usePlaybackActions();

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
        const nextItems = playlist.slice(currentSongIndex + 1);
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

    return (
        <div className="h-full flex flex-col bg-transparent relative overflow-hidden">
            {/* Fixed Top Header Area */}
            <div className="w-full h-14 z-50 flex-shrink-0 flex items-center justify-between px-3">
                <span className="text-lg font-bold text-white">播放队列</span>
            </div>

            {/* Sortable List */}
            <div
                className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden relative z-10 block pb-24"
                style={{
                    maskImage: 'linear-gradient(to bottom, black calc(100% - 96px), transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 96px), transparent 100%)'
                }}
            >
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis]}
                >
                    {/* Section 1: User Queue */}
                    {queueList.length > 0 && (
                        <div className="mb-4">
                            <div className="px-3 py-2 flex items-center justify-between">
                                <span className="text-sm font-bold text-white">队列中的下一首歌</span>
                                <button
                                    onClick={clearUserQueue}
                                    className="text-xs font-bold text-white/60 hover:text-white transition-colors"
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
                    <div className="px-3 py-2 flex items-center gap-1 text-sm font-bold text-white">
                        {queueContext?.type === 'home' ? (
                            <span>下一首</span>
                        ) : (
                            <>
                                <span>下一首歌来自:</span>
                                <span
                                    onClick={() => {
                                        if (!queueContext || !onNavigate) return;
                                        const { type, id, name } = queueContext;
                                        if (id === 'favorites' || id === 'playlist:favorites') {
                                            useNavigationStore.getState().push({ type: 'playlist_detail', data: { id: 'favorites', name: '喜爱歌曲' } });
                                            onNavigate();
                                        } else if (type === 'playlist' || type === 'playlist_detail') {
                                            // Assuming id is the playlist id
                                            const pid = parseInt(id || '0');
                                            if (pid) {
                                                useNavigationStore.getState().push({ type: 'playlist_detail', data: { id: pid, name } });
                                                onNavigate();
                                            }
                                        } else if (type === 'artist' || type === 'artist_detail') {
                                            useNavigationStore.getState().push({ type: 'artist_detail', data: { name, count: 0, albumCount: 0, songs: [], cover: null } });
                                            onNavigate();
                                        } else if (type === 'album' || type === 'album_detail') {
                                            // For album we typically need artist name too for best results, but let's try with just name
                                            // Often id might store "Artist - Album" or just name. 
                                            // Let's assume name is the album name.
                                            useNavigationStore.getState().push({ type: 'album_detail', data: { name, artist: undefined, songs: [], cover: null, count: 0 } });
                                            onNavigate();
                                        } else if (type === 'library') {
                                            useNavigationStore.getState().navigate('library');
                                            onNavigate();
                                        }
                                    }}
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
                            {nextFromList.length === 0 && queueList.length === 0 && (<div className="text-white/30 py-8 text-sm text-center italic">没有待播放的歌曲</div>)}
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
