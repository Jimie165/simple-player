import { useState, useEffect, useRef, useCallback } from 'react';
import clsx from 'clsx';
import { MdMusicNote } from 'react-icons/md';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import type { SongMetadata } from '@/types';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import SongCoverOverlay from '@/components/common/SongCoverOverlay';
import { useSongOperations } from '@/hooks/menu/useSongOperations';

interface PlayQueuePopupProps {
    show: boolean;
    onNavigateClose?: () => void;
}

export default function PlayQueuePopup({ show, onNavigateClose }: PlayQueuePopupProps) {
    const {
        playlist,
        currentSongIndex,
        removeSongFromPlaylistByIndex
    } = useLibraryStore();
    const { togglePlay, restartSong } = usePlayerStore();
    const { playQueueItem } = usePlaybackActions();

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: SongMetadata; index: number } | null>(null);
    const [listMounted, setListMounted] = useState(show);

    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
    const headerHeight = 62;
    const rowHeight = 56; // 40px content + p-2 (16px) = 56px per row
    const listPadding = 16; // p-2 around the list (16px)
    const popupMaxHeight = 384;
    const queueHeight = Math.min(
        Math.max(playlist.length * rowHeight + listPadding, rowHeight + listPadding),
        popupMaxHeight - headerHeight
    );

    const scrollCurrentIntoView = useCallback(() => {
        if (!show) return;
        if (playlist.length === 0) return;
        if (currentSongIndex < 0 || currentSongIndex >= playlist.length) return;

        virtuosoRef.current?.scrollToIndex({
            index: currentSongIndex,
            align: 'center',
            behavior: 'auto'
        });
    }, [show, playlist.length, currentSongIndex]);

    useEffect(() => {
        if (!show) return;
        if (listMounted) return;
        const rafId = window.requestAnimationFrame(() => setListMounted(true));
        return () => window.cancelAnimationFrame(rafId);
    }, [show, listMounted]);

    useEffect(() => {
        if (show && playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
            const rafId = window.requestAnimationFrame(() => {
                scrollCurrentIntoView();
            });
            const timeoutId = window.setTimeout(() => {
                scrollCurrentIntoView();
            }, 80);

            return () => {
                window.cancelAnimationFrame(rafId);
                window.clearTimeout(timeoutId);
            };
        }

        // Auto-close context menu when popup closes
        if (!show) {
            const frame = requestAnimationFrame(() => setContextMenu(null));
            return () => cancelAnimationFrame(frame);
        }
    }, [show, currentSongIndex, playlist.length, scrollCurrentIntoView]);

    const handlePlay = useCallback(async (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => {
        // In the play queue, we strictly use index to define the "current" playing item.
        // This allows multiple instances of the same song to coexist and be handled separately.
        if (index === currentSongIndex && !options?.restartIfCurrent) {
            togglePlay();
            return;
        }

        // Always reset progress bar display even if metadata allows (for restart same song case)
        restartSong();

        await playQueueItem({ song, index, restartIfCurrent: options?.restartIfCurrent });
    }, [currentSongIndex, playQueueItem, restartSong, togglePlay]);

    const contextMenuOps = useSongOperations({
        items: contextMenu ? [contextMenu.song] : [],
        context: 'queue',
        onPlay: contextMenu ? () => handlePlay(contextMenu.song, contextMenu.index, { restartIfCurrent: true }) : undefined,
        onDelete: contextMenu ? () => removeSongFromPlaylistByIndex(contextMenu.index) : undefined,
        onNavigate: onNavigateClose,
        hideSelect: true
    });

    const handleContextMenu = useCallback((e: React.MouseEvent, song: SongMetadata, index: number) => {
        e.preventDefault();
        e.stopPropagation();

        // Simulate a mousedown to close other open menus
        e.currentTarget.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window
        }));

        setContextMenu({ x: e.clientX, y: e.clientY, song, index });
    }, []);

    const renderQueueItem = useCallback((index: number, song: SongMetadata) => {
        const isCurrent = index === currentSongIndex;

        return (
            <div
                key={`${song.id ?? song.path ?? song.title}-${index}`}
                onDoubleClick={() => handlePlay(song, index)}
                onContextMenu={(e) => handleContextMenu(e, song, index)}
                className={clsx(
                    "group flex items-center gap-3 p-2 rounded-lg text-xs cursor-default transition-colors",
                    isCurrent
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-200"
                )}
            >
                <div className="w-10 h-10 shrink-0 rounded overflow-hidden bg-neutral-200 dark:bg-neutral-800">
                    <SongCoverOverlay
                        song={song}
                        className="w-full h-full"
                        onPlay={() => handlePlay(song, index, { restartIfCurrent: true })}
                        isActive={isCurrent}
                        iconClassName="text-neutral-400"
                        restartOnPlay
                    />
                </div>

                <div className="flex-1 flex flex-col min-w-0 justify-center">
                    <span className="truncate font-medium">{song.title || "Unknown Title"}</span>
                    <span className="truncate text-[10px] opacity-70">{song.artist || "Unknown Artist"}</span>
                </div>

                <div
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <SmartMusicContextMenu
                        items={song}
                        context="queue"
                        variant="clean"
                        buttonClassName="w-6 h-6"
                        onPlay={() => handlePlay(song, index, { restartIfCurrent: true })}
                        onDelete={() => removeSongFromPlaylistByIndex(index)}
                        onOpen={() => setContextMenu(null)}
                        onNavigate={onNavigateClose}
                        suppressCloseEvent
                        hideSelect
                    />
                </div>
            </div>
        );
    }, [currentSongIndex, handleContextMenu, handlePlay, onNavigateClose, removeSongFromPlaylistByIndex]);



    return (
        <div className={clsx(
            "absolute bottom-full right-0 mb-4 w-80 rounded-2xl shadow-xl border overflow-hidden flex flex-col",
            "bg-white/95 dark:bg-[#2d2d2d]/95 backdrop-blur-md border-neutral-200 dark:border-neutral-700",
            "transition-all duration-200 origin-bottom-right z-60",
            show ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
        )} style={{ maxHeight: `${popupMaxHeight}px` }}>

            {/* 标题 */}
            <div className="p-4 border-b border-neutral-200/50 dark:border-neutral-700/50 bg-neutral-50/50 dark:bg-white/5">
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">播放队列</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    共 {playlist.length} 首歌曲
                </p>
            </div>

            {/* 列表 */}
            <div className="overflow-hidden p-2" style={{ height: `${queueHeight}px` }}>
                {playlist.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-neutral-400 text-xs">
                        <MdMusicNote className="text-3xl mb-2 opacity-20" />
                        <span>队列为空</span>
                    </div>
                ) : (
                    listMounted && (
                        <Virtuoso
                            ref={virtuosoRef}
                            data={playlist}
                            initialTopMostItemIndex={currentSongIndex >= 0 ? currentSongIndex : 0}
                            itemContent={renderQueueItem}
                            className="h-full scrollbar-thin"
                            style={{ height: '100%' }}
                            fixedItemHeight={rowHeight}
                            overscan={480}
                            computeItemKey={(index, song) => `${song.id ?? song.path ?? song.title}-${index}`}
                        />
                    )
                )}
            </div>

            {/* Right-click Context Menu */}
            {contextMenu && (
                <SmartCursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    item={contextMenu.song}
                    context="queue"
                    onClose={() => setContextMenu(null)}
                    onPlay={() => handlePlay(contextMenu.song, contextMenu.index, { restartIfCurrent: true })}
                    onDelete={() => removeSongFromPlaylistByIndex(contextMenu.index)}
                    onNavigate={onNavigateClose}
                    hideSelect
                    menuGroups={contextMenuOps.menuItems}
                />
            )}
        </div>
    );
}
