import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IoPlay, IoEllipsisHorizontal } from 'react-icons/io5';

import CoverImage from '@/components/common/CoverImage';
import MusicContextMenu from '@/components/common/MusicContextMenu';
import { useSongOperations } from '@/hooks/menu/useSongOperations';
import type { SongMetadata } from '@/types';

interface QueueRowMenuProps {
    song: SongMetadata;
    onRemove?: () => void;
    onNavigate?: () => void;
    autoOpen?: boolean;
    onAutoOpened?: () => void;
    appearance?: 'immersive' | 'content';
    onPlay?: () => void;
}

export function QueueRowMenu({ song, onRemove, onNavigate, autoOpen, onAutoOpened, appearance = 'immersive', onPlay }: QueueRowMenuProps) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const ops = useSongOperations({
        items: [song],
        context: 'queue',
        onDelete: onRemove,
        onNavigate,
        onPlay,
        hideSelect: appearance === 'content',
    });

    useEffect(() => {
        if (!autoOpen) return;
        const rafId = window.requestAnimationFrame(() => {
            const button = wrapperRef.current?.querySelector('button');
            if (button instanceof HTMLButtonElement) {
                button.click();
            }
            onAutoOpened?.();
        });

        return () => window.cancelAnimationFrame(rafId);
    }, [autoOpen, onAutoOpened]);

    return (
        <div ref={wrapperRef}>
            <MusicContextMenu
                groups={onRemove ? ops.menuItems : ops.menuItems
                    .map((group) => group.filter((item) => item.id !== 'remove_queue'))
                    .filter((group) => group.length > 0)}
                variant="clean"
                buttonClassName={clsx('group/queue-menu w-8 h-8 flex items-center justify-center transition-colors cursor-pointer', appearance === 'content' ? 'text-on-surface-variant hover:text-primary' : 'text-white/50 hover:text-white')}
            >
                <IoEllipsisHorizontal className={appearance === 'content' ? 'text-on-surface-variant group-hover/queue-menu:text-primary transition-colors' : undefined} />
            </MusicContextMenu>
        </div>
    );
}

const MemoQueueRowMenu = React.memo(QueueRowMenu);

interface SongRowProps {
    song: SongMetadata;
    isActive?: boolean;
    onPlay: () => void;
    style?: React.CSSProperties;
    itemRef?: (node: HTMLElement | null) => void;
    dragAttributes?: object;
    dragListeners?: object;
    isDraggable?: boolean;
    onRemove?: () => void;
    onNavigate?: () => void;
    appearance?: 'immersive' | 'content';
}

function SongRow({
    song,
    isActive,
    onPlay,
    style,
    itemRef,
    dragAttributes,
    dragListeners,
    isDraggable,
    onRemove,
    onNavigate,
    appearance = 'immersive',
}: SongRowProps) {
    const [menuReady, setMenuReady] = useState(false);
    const [menuAutoOpen, setMenuAutoOpen] = useState(false);
    const isContent = appearance === 'content';

    return (
        <div
            ref={itemRef}
            style={style}
            {...(isDraggable ? dragAttributes : {})}
            {...(isDraggable ? dragListeners : {})}
            onDoubleClick={isContent ? onPlay : undefined}
            onContextMenu={isContent ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenuReady(true);
                setMenuAutoOpen(true);
            } : undefined}
            className={clsx(
                'group flex items-center rounded-md transition-colors select-none',
                isContent
                    ? 'min-h-17 gap-3 px-2 py-2 hover:bg-on-surface/5'
                    : 'min-h-[clamp(3.3rem,5.1vw,5.1rem)] gap-[clamp(0.5rem,1.5vw,1rem)] px-[clamp(0.5rem,1.5vw,1rem)] py-[clamp(0.2rem,0.4vw,0.45rem)]',
                !isContent && (isActive ? 'bg-white/10' : 'hover:bg-white/5')
            )}
        >
            <div
                className={clsx('relative rounded-sm overflow-hidden shrink-0 bg-neutral-800 shadow-sm group-hover:shadow-md transition-all cursor-pointer', isContent && 'w-12 h-12')}
                style={isContent ? undefined : { width: 'clamp(2.75rem, 4.25vw, 4.25rem)', height: 'clamp(2.75rem, 4.25vw, 4.25rem)' }}
                onPointerDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.stopPropagation();
                    onPlay();
                }}
                onDoubleClick={isContent ? (event) => event.stopPropagation() : undefined}
            >
                <CoverImage thumbnail={128}
song={song} className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                    <IoPlay className="text-[clamp(1rem,1.8vw,1.5rem)] text-white" />
                </div>
            </div>

            <div className={clsx('flex-1 min-w-0 flex flex-col justify-center gap-[0.18em] self-stretch', !isContent && 'py-[clamp(0.2rem,0.4vw,0.45rem)] border-b border-white/5 group-last:border-none')}>
                <div
                    className={clsx(
                        'font-medium truncate leading-[1.55]',
                        isContent ? 'text-sm' : 'text-[clamp(0.75rem,1.5vw,1.125rem)]',
                        isActive ? 'text-primary' : isContent ? 'text-on-surface' : 'text-white/90'
                    )}
                >
                    {song.title}
                </div>
                <div className={clsx('truncate leading-[1.55]', isContent ? 'text-xs text-on-surface-variant' : 'text-[clamp(0.625rem,1.2vw,0.875rem)] text-white/50')}>
                    {song.artist}
                </div>
            </div>

            <div
                className={clsx('p-1 -mr-2', isContent && 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity')}
                onPointerDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onMouseEnter={() => setMenuReady(true)}
                onFocus={() => setMenuReady(true)}
            >
                {menuReady ? (
                    <MemoQueueRowMenu
                        song={song}
                        onRemove={onRemove}
                        onNavigate={onNavigate}
                        autoOpen={menuAutoOpen}
                        onAutoOpened={() => setMenuAutoOpen(false)}
                        appearance={appearance}
                        onPlay={isContent ? onPlay : undefined}
                    />
                ) : (
                    <button
                        className={clsx('w-8 h-8 flex items-center justify-center transition-colors cursor-pointer', isContent ? 'text-on-surface-variant hover:text-primary' : 'text-white/50 hover:text-white')}
                        onClick={(event) => {
                            event.stopPropagation();
                            setMenuReady(true);
                            setMenuAutoOpen(true);
                        }}
                        aria-label="打开操作菜单"
                    >
                        <IoEllipsisHorizontal />
                    </button>
                )}
            </div>
        </div>
    );
}

const MemoSongRow = React.memo(SongRow);

export interface SortableQueueItemProps {
    song: SongMetadata;
    index: number;
    isActive?: boolean;
    onPlayIndex: (index: number) => void;
    onRemoveIndex: (index: number) => void;
    onNavigate?: () => void;
    appearance?: 'immersive' | 'content';
}

/**
 * 播放队列可拖拽行项，封装 dnd-kit 与行 UI。
 */
function SortableQueueItemImpl({
    song,
    index,
    isActive,
    onPlayIndex,
    onRemoveIndex,
    onNavigate,
    appearance,
}: SortableQueueItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: `${index}-${song.id || song.path}`,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 'auto',
        opacity: isDragging ? 0 : 1,
        touchAction: 'pan-y' as const,
    };

    return (
        <MemoSongRow
            song={song}
            isActive={isActive}
            onPlay={() => onPlayIndex(index)}
            style={style}
            itemRef={setNodeRef}
            dragAttributes={attributes}
            dragListeners={listeners}
            isDraggable={true}
            onRemove={() => onRemoveIndex(index)}
            onNavigate={onNavigate}
            appearance={appearance}
        />
    );
}

export const SortableQueueItem = React.memo(SortableQueueItemImpl, (prev, next) => {
    return (
        prev.index === next.index &&
        prev.song === next.song &&
        prev.isActive === next.isActive &&
        prev.appearance === next.appearance &&
        prev.onNavigate === next.onNavigate &&
        prev.onPlayIndex === next.onPlayIndex &&
        prev.onRemoveIndex === next.onRemoveIndex
    );
});
