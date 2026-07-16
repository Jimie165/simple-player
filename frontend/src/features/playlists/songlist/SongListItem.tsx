import { memo } from 'react';
import { MdFavorite, MdFavoriteBorder } from 'react-icons/md';
import clsx from 'clsx';

import CustomTooltip from '@/components/common/CustomTooltip';
import type { SongMetadata } from '@/types';
import SongCoverOverlay from '@/components/common/SongCoverOverlay';
import MusicContextMenu from '@/components/common/MusicContextMenu';
import { useSongOperations } from '@/hooks/menu/useSongOperations';
import type { MusicMenuContext } from '@/hooks/menu/useSongOperations';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useNavigationStore } from '@/store/useNavigationStore';

const getSongId = (song: SongMetadata, index: number) => {
    if (song.unique_id !== undefined && song.unique_id !== null) return song.unique_id.toString();
    if (song.id !== undefined && song.id !== null) return `${song.id}-${index}`;
    return song.path ? `${song.path}-${index}` : `temp-${index}`;
};

const SongListItemMenu = memo(({
    song,
    index,
    onPlay,
    onMenuOpen,
    isSelectionMode,
    toggleSelection,
    onSelect,
    selected,
    playlistId,
    context = 'playlist'
}: {
    song: SongMetadata;
    index: number;
    onPlay?: (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => void;
    onMenuOpen?: () => void;
    isSelectionMode?: boolean;
    toggleSelection?: (id: string, type: 'song', data: SongMetadata) => void;
    onSelect?: (song: SongMetadata) => void;
    selected?: boolean;
    playlistId?: number;
    context?: MusicMenuContext;
}) => {
    const { menuItems } = useSongOperations({
        items: [song],
        context,
        playlistId,
        onPlay: onPlay ? () => onPlay(song, index, { restartIfCurrent: true }) : undefined,
        onSelect: onSelect ? () => {
            if (isSelectionMode && toggleSelection) {
                toggleSelection(getSongId(song, index), 'song', song);
            } else if (onSelect) {
                onSelect(song);
            }
        } : undefined,
        isSelected: selected,
    });

    return (
        <MusicContextMenu
            groups={menuItems}
            onOpen={onMenuOpen}
            variant="clean"
        />
    );
});

export const SongListItem = memo(({
    song,
    index,
    style: gridStyle,
    isSelectionMode,
    selected,
    onPlay,
    handleItemClick,
    handleContextMenu,
    hideAlbum,
    hideArtist,
    formatDuration,
    toggleFavorite,
    isDragging,
    isOverlay,
    dragCount,
    onSelect,
    onMenuOpen,
    toggleSelection,
    playlistId,
    context,
    isFav
}: {
    song: SongMetadata;
    index: number;
    style: React.CSSProperties;
    isSelectionMode?: boolean;
    selected?: boolean;
    onPlay?: (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => void;
    handleItemClick?: (e: React.MouseEvent, song: SongMetadata) => void;
    handleContextMenu?: (e: React.MouseEvent, song: SongMetadata, index: number) => void;
    hideAlbum?: boolean;
    hideArtist?: boolean;
    formatDuration: (sec: number) => string;
    toggleFavorite?: (song: SongMetadata) => void;
    isDragging?: boolean;
    isOverlay?: boolean;
    dragCount?: number;
    onSelect?: (song: SongMetadata) => void;
    onMenuOpen?: () => void;
    toggleSelection?: (id: string, type: 'song', data: SongMetadata) => void;
    playlistId?: number;
    context?: MusicMenuContext;
    isFav?: boolean;
}) => {
    const { push } = useNavigationStore();

    return (
        <div
            style={gridStyle}
            className={clsx(
                "group grid gap-4 px-4 py-2 items-center rounded-lg transition-colors relative touch-none",
                isOverlay
                    ? "bg-surface-container-high elevation-3 border border-outline-variant/10 cursor-grabbing shadow-2xl scale-[1.02]"
                    : selected
                        ? "bg-primary/10 hover:bg-primary/15"
                        : isDragging
                            ? "bg-surface-container-high elevation-2 opacity-50"
                            : "hover:bg-surface-container-highest active:bg-surface-container-high hover:elevation-1",
                "cursor-default text-[14px]",
                isDragging && !isOverlay ? "opacity-30" : ""
            )}
            onClick={(e) => handleItemClick && handleItemClick(e, song)}
            onDoubleClick={() => {
                if (!isSelectionMode && onPlay) {
                    const { metadata, togglePlay } = usePlayerStore.getState();
                    const isCurrent = metadata && (
                        (song.id !== undefined && song.id === metadata.id) ||
                        (song.path === metadata.path)
                    );
                    if (isCurrent) {
                        togglePlay();
                    } else {
                        onPlay(song, index);
                    }
                }
            }}
            onContextMenu={(e) => handleContextMenu && handleContextMenu(e, song, index)}
        >
            {isOverlay && dragCount && dragCount > 1 && (
                <div className="absolute -top-2 -right-2 bg-primary text-on-primary w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-md z-50">
                    {dragCount}
                </div>
            )}

            {selected && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-lg" />
            )}

            <div className="flex justify-center items-center">
                <CustomTooltip text={isFav ? "取消喜爱" : "喜爱"} placement="top">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite?.(song);
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                        className={clsx(
                            "flex items-center justify-center w-6 h-6 rounded-full transition-all active:scale-95",
                            isFav
                                ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 opacity-100"
                                : "text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-white/5 opacity-0 group-hover:opacity-100"
                        )}
                    >
                        {isFav ? <MdFavorite className="text-base" /> : <MdFavoriteBorder className="text-base" />}
                    </button>
                </CustomTooltip>
            </div>

            <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-[4px] shrink-0 bg-neutral-200 dark:bg-neutral-800 overflow-hidden shadow-sm border border-neutral-200/10 relative group/cover cursor-pointer">
                    <SongCoverOverlay
                        song={song}
                        className="w-full h-full"
                        onPlay={() => !isDragging && onPlay && onPlay(song, index, { restartIfCurrent: true })}
                        restartOnPlay
                    />
                </div>
                <span className={clsx(
                    "font-medium truncate pr-4",
                    selected ? "text-primary dark:text-primary-light" : "text-neutral-900 dark:text-neutral-100"
                )}>
                    {song.title}
                </span>
            </div>

            {!hideArtist && (
                <div className="text-neutral-500 dark:text-neutral-400 truncate font-medium">
                    <span
                        className={clsx(
                            "transition-colors",
                            !isSelectionMode ? "cursor-pointer hover:text-primary" : "cursor-default"
                        )}
                        onClick={(e) => {
                            if (e.detail !== 1) return;
                            if (isSelectionMode) return;
                            e.stopPropagation();
                            push({ type: 'artist_detail', data: { name: song.artist } });
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                    >
                        {song.artist}
                    </span>
                </div>
            )}

            {!hideAlbum && (
                <div className="text-neutral-500 dark:text-neutral-400 truncate">
                    <span
                        className={clsx(
                            "transition-colors",
                            !isSelectionMode ? "cursor-pointer hover:text-primary" : "cursor-default"
                        )}
                        onClick={(e) => {
                            if (e.detail !== 1) return;
                            if (isSelectionMode) return;
                            e.stopPropagation();
                            push({ type: 'album_detail', data: { name: song.album, artist: song.artist } });
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                        }}
                    >
                        {song.album}
                    </span>
                </div>
            )}

            <div className="text-neutral-500 dark:text-neutral-400 text-right pr-2 text-[13px] font-variant-numeric">
                {formatDuration(song.duration)}
            </div>

            <div
                className={clsx(
                    "flex justify-end transition-opacity",
                    isSelectionMode || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                <SongListItemMenu
                    song={song}
                    index={index}
                    onPlay={onPlay}
                    onMenuOpen={onMenuOpen}
                    isSelectionMode={isSelectionMode}
                    toggleSelection={toggleSelection}
                    onSelect={onSelect}
                    selected={selected}
                    playlistId={playlistId}
                    context={context}
                />
            </div>
        </div>
    );
});
