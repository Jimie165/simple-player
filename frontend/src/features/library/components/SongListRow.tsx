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

function SongListRowImpl({
    index,
    isLast,
    song,
    gridStyle,
    gridGapClass,
    rowPaddingClass,
    isSelectionMode,
    selected,
    previousSelected = false,
    nextSelected = false,
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
    isLast: boolean;
    song: SongMetadata;
    gridStyle: React.CSSProperties;
    gridGapClass: string;
    rowPaddingClass: string;
    isSelectionMode: boolean;
    selected: boolean;
    previousSelected?: boolean;
    nextSelected?: boolean;
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
    onSelect: (song: SongMetadata) => void;
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
                "group isolate grid items-center relative before:absolute before:inset-y-0 before:-z-10 before:pointer-events-none before:transition-colors before:duration-150 after:absolute after:bottom-0 after:right-4 after:border-b after:border-outline-variant/40 after:pointer-events-none after:transition-opacity after:duration-150 hover:after:opacity-0",
                "h-13.5",
                context === 'library' ? "before:left-9 before:right-0" : "before:left-12 before:right-2",
                isLast ? (context === 'library' ? "after:left-11" : "after:left-14") : hideCover
                    ? (context === 'library' ? "after:left-19" : "after:left-22")
                    : (context === 'library' ? "after:left-25" : "after:left-28"),
                gridGapClass,
                rowPaddingClass,
                selected
                    ? "before:bg-on-surface/12 base-theme:before:bg-secondary-container after:opacity-0"
                    : "hover:before:bg-on-surface/8 active:before:bg-on-surface/10",
                (!selected || !previousSelected) && "before:rounded-t-xl",
                (!selected || !nextSelected) && "before:rounded-b-xl",
                "cursor-default text-[14px]"
            )}
        >
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
                                ? "text-red-500 hover:bg-red-500/10 opacity-100"
                                : "text-on-surface-variant hover:text-red-500 hover:bg-on-surface/8 opacity-0 group-hover:opacity-100"
                        )}
                    >
                        {isFav ? <MdFavorite className="text-base" /> : <MdFavoriteBorder className="text-base" />}
                    </button>
                </CustomTooltip>
            </div>

            <div className="flex items-center gap-3 overflow-hidden">
                {!hideCover && (
                    <div className="w-11 h-11 rounded-sm shrink-0 bg-neutral-200 dark:bg-neutral-800 overflow-hidden shadow-sm border border-neutral-200/10 relative group/cover cursor-pointer">
                        <SongCoverOverlay
                            song={song}
                            className="w-full h-full"
                            onPlay={() => onPlay(song, index, { restartIfCurrent: true })}
                            restartOnPlay
                        />
                    </div>
                )}
                {hideCover && (
                    <span className="w-5 shrink-0 text-center text-on-surface-variant tabular-nums">{index + 1}</span>
                )}
                <span className="font-medium truncate pr-4 text-on-surface">
                    {song.title}
                </span>
            </div>

            {!hideArtist && (
                <div
                    className={clsx(
                        "truncate font-medium transition-colors group-hover:text-on-surface",
                        selected ? "text-on-surface" : "text-on-surface-variant",
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
                        "truncate transition-colors group-hover:text-on-surface",
                        selected ? "text-on-surface" : "text-on-surface-variant",
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

            <div className={clsx("text-right pr-2 text-[13px] font-variant-numeric transition-colors group-hover:text-on-surface", selected ? "text-on-surface" : "text-on-surface-variant")}>
                {formatDuration(song.duration)}
            </div>

            <div
                className="flex justify-end"
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                <SmartMusicContextMenu
                    items={song}
                    context={context}
                    variant="clean"
                    buttonClassName="w-8 h-8 [&_svg]:size-4 text-on-surface-variant! hover:text-primary! hover:opacity-100!"
                    onPlay={() => onPlay(song, index, { restartIfCurrent: true })}
                    onDelete={enableDelete && onDelete ? () => onDelete(song) : undefined}
                    isSelected={selected}
                    onSelect={() => onSelect(song)}
                />
            </div>
        </div>
    );
}

export const SongListRow = React.memo(SongListRowImpl);
