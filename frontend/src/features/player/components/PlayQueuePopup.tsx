import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { MdMusicNote } from 'react-icons/md';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { usePlaybackActions } from '@/hooks/usePlaybackActions';
import type { SongMetadata } from '@/types';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import SongCoverOverlay from '@/components/common/SongCoverOverlay';
import { useSongOperations } from '@/hooks/useSongOperations';

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

    const contextMenuOps = useSongOperations({
        items: contextMenu ? [contextMenu.song] : [],
        context: 'queue',
        onPlay: contextMenu ? () => handlePlay(contextMenu.song, contextMenu.index, { restartIfCurrent: true }) : undefined,
        onDelete: contextMenu ? () => removeSongFromPlaylistByIndex(contextMenu.index) : undefined,
        onNavigate: onNavigateClose,
        hideSelect: true
    });

    const activeItemRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (show && activeItemRef.current && listRef.current) {
            const container = listRef.current;
            const item = activeItemRef.current;

            // Manual scroll calculation to avoid layout shift caused by scrollIntoView
            const itemTop = item.offsetTop;
            const itemHeight = item.offsetHeight;
            const containerHeight = container.clientHeight;

            // Center the item
            container.scrollTop = itemTop - containerHeight / 2 + itemHeight / 2;
        }
        // Auto-close context menu when popup closes
        if (!show) {
            setContextMenu(null);
        }
    }, [show, currentSongIndex]);

    const handlePlay = async (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => {
        // In the play queue, we strictly use index to define the "current" playing item.
        // This allows multiple instances of the same song to coexist and be handled separately.
        if (index === currentSongIndex && !options?.restartIfCurrent) {
            togglePlay();
            return;
        }

        // Always reset progress bar display even if metadata allows (for restart same song case)
        restartSong();

        await playQueueItem({ song, index, restartIfCurrent: options?.restartIfCurrent });
    };

    const handleContextMenu = (e: React.MouseEvent, song: SongMetadata, index: number) => {
        e.preventDefault();
        e.stopPropagation();

        // Simulate a mousedown to close other open menus
        e.currentTarget.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window
        }));

        setContextMenu({ x: e.clientX, y: e.clientY, song, index });
    };



    return (
        <div className={clsx(
            "absolute bottom-full right-0 mb-4 w-80 max-h-96 rounded-2xl shadow-xl border overflow-hidden flex flex-col",
            "bg-white/95 dark:bg-[#2d2d2d]/95 backdrop-blur-md border-neutral-200 dark:border-neutral-700",
            "transition-all duration-200 origin-bottom-right z-[60]",
            show ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
        )}>

            {/* 标题 */}
            <div className="p-4 border-b border-neutral-200/50 dark:border-neutral-700/50 bg-neutral-50/50 dark:bg-white/5">
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">播放队列</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    共 {playlist.length} 首歌曲
                </p>
            </div>

            {/* 列表 */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-2 scrollbar-thin">
                {playlist.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-neutral-400 text-xs">
                        <MdMusicNote className="text-3xl mb-2 opacity-20" />
                        <span>队列为空</span>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {playlist.map((song, index) => {
                            const isCurrent = index === currentSongIndex;
                            return (
                                <div
                                    key={index}
                                    ref={isCurrent ? activeItemRef : null}
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

                                    {/* Three dots menu button */}
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
                        })}
                    </div>
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