import React from 'react';
import { MdFavorite, MdFavoriteBorder } from 'react-icons/md';
import clsx from 'clsx';

import type { SongMetadata } from '@/types';
import SongCoverOverlay from '@/components/common/SongCoverOverlay';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';
import type { MusicMenuContext } from '@/hooks/menu/useSongOperations';
import CustomTooltip from '@/components/common/CustomTooltip';
import { getMusicItemId } from '@/utils/musicItemUtils';
import { usePlayerStore } from '@/store/usePlayerStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';

export function SongListRow({
    index,
    song,
    gridStyle,
    gridGapClass,
    rowPaddingClass,
    isSelectionMode,
    selected,
    isFav,
    hideCover,
    hideArtist,
    effectiveHideAlbum,
    context,
    enableDelete,
    onDelete,
    onPlay,
    formatDuration,
    toggleFavorite,
    onOpenArtist,
    onOpenAlbum,
    onContextMenu,
    onRowClick,
    onSelect,
}: {
    index: number;
    song: SongMetadata;
    gridStyle: React.CSSProperties;
    gridGapClass: string;
    rowPaddingClass: string;
    isSelectionMode: boolean;
    selected: boolean;
    isFav: boolean;
    hideCover: boolean;
    hideArtist: boolean;
    effectiveHideAlbum: boolean;
    context: MusicMenuContext;
    enableDelete: boolean;
    onDelete?: (song: SongMetadata) => void;
    onPlay: (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => void;
    formatDuration: (sec: number) => string;
    toggleFavorite: (song: SongMetadata) => void;
    onOpenArtist?: (artist: string) => void;
    onOpenAlbum?: (album: string) => void;
    onContextMenu: (e: React.MouseEvent, song: SongMetadata, index: number) => void;
    onRowClick: (e: React.MouseEvent, song: SongMetadata) => void;
    onSelect: () => void;
}) {
    const id = getMusicItemId(song);
    const { togglePlayback } = usePlaybackActions();

    return (
        <div
            key={id || index}
            onDoubleClick={() => {
                if (!isSelectionMode) {
                    const { metadata } = usePlayerStore.getState();
                    const isCurrent = metadata && (
                        (song.id !== undefined && song.id === metadata.id) ||
                        (song.path === metadata.path)
                    );
                    if (isCurrent) {
                        void togglePlayback();
                    } else {
                        onPlay(song, index);
                    }
                }
            }}
            onClick={(e) => onRowClick(e, song)}
            onContextMenu={(e) => onContextMenu(e, song, index)}
            style={gridStyle}
            className={clsx(
                "group grid py-2 items-center rounded-lg transition-colors relative",
                gridGapClass,
                rowPaddingClass,
                selected
                    ? "bg-primary/10 hover:bg-primary/15"
                    : "hover:bg-surface-container-highest active:bg-surface-container-high hover:elevation-1",
                "cursor-default text-[14px]"
            )}
        >
            {selected && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-lg" />
            )}

            <div className="flex justify-center items-center">
                <CustomTooltip text={isFav ? "取消喜爱" : "喜爱"} placement="top">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(song);
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
                {!hideCover && (
                    <div className="w-10 h-10 rounded-sm shrink-0 bg-neutral-200 dark:bg-neutral-800 overflow-hidden shadow-sm border border-neutral-200/10 relative group/cover cursor-pointer">
                        <SongCoverOverlay
                            song={song}
                            className="w-full h-full"
                            onPlay={() => onPlay(song, index, { restartIfCurrent: true })}
                            restartOnPlay
                        />
                    </div>
                )}
                <span className={clsx(
                    "font-medium truncate pr-4",
                    selected ? "text-primary dark:text-primary-light" : "text-neutral-900 dark:text-neutral-100"
                )}>
                    {song.title}
                </span>
            </div>

            {!hideArtist && (
                <div
                    className={clsx(
                        "text-neutral-500 dark:text-neutral-400 truncate font-medium transition-colors",
                        !isSelectionMode && onOpenArtist && song.artist && "hover:text-primary cursor-pointer"
                    )}
                    onClick={(e) => {
                        if (e.detail !== 1) return;
                        if (isSelectionMode) return;
                        if (onOpenArtist && song.artist) {
                            e.stopPropagation();
                            onOpenArtist(song.artist);
                        }
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                >
                    {song.artist}
                </div>
            )}

            {!effectiveHideAlbum && (
                <div
                    className={clsx(
                        "text-neutral-500 dark:text-neutral-400 truncate transition-colors",
                        !isSelectionMode && onOpenAlbum && song.album && "hover:text-primary cursor-pointer"
                    )}
                    onClick={(e) => {
                        if (e.detail !== 1) return;
                        if (isSelectionMode) return;
                        if (onOpenAlbum && song.album) {
                            e.stopPropagation();
                            onOpenAlbum(song.album);
                        }
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                    }}
                >
                    {song.album}
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
                <SmartMusicContextMenu
                    items={song}
                    context={context}
                    variant="clean"
                    onPlay={() => onPlay(song, index, { restartIfCurrent: true })}
                    onDelete={enableDelete && onDelete ? () => onDelete(song) : undefined}
                    isSelected={selected}
                    onSelect={onSelect}
                />
            </div>
        </div>
    );
}
