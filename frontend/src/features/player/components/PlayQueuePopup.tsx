import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { MdMusicNote, MdRemoveCircle } from 'react-icons/md';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { usePlayerStore } from '../../../store/usePlayerStore';
import { useNavigationStore } from '../../../store/useNavigationStore';
import { usePlaybackActions } from '../../../hooks/usePlaybackActions';
import { useAddToPlaylistStore } from '../../../store/useAddToPlaylistStore';
import type { SongMetadata } from '../../../types';
import MusicContextMenu, { getMusicMenuGroups } from '../../../components/common/MusicContextMenu';
import CursorContextMenu from '../../../components/common/CursorContextMenu';
import InfoDialog from '../../../components/common/InfoDialog';
import SongCoverOverlay from '../../../components/common/SongCoverOverlay';
import { libraryService } from '../../../services/libraryService';

interface PlayQueuePopupProps {
    show: boolean;
}

export default function PlayQueuePopup({ show }: PlayQueuePopupProps) {
    const {
        playlist,
        currentSongIndex,
        removeSongFromPlaylistByIndex,
        addToNext,
        toggleFavorite
    } = useLibraryStore();
    const { togglePlay, restartSong } = usePlayerStore();
    const { playQueueItem } = usePlaybackActions();
    const { push } = useNavigationStore();
    const addToPlaylistStore = useAddToPlaylistStore();

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: SongMetadata; index: number } | null>(null);

    // Properties dialog state
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [propertySong, setPropertySong] = useState<SongMetadata | null>(null);

    const activeItemRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (show && activeItemRef.current) {
            activeItemRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

    const handleShowProperties = (song: SongMetadata) => {
        setPropertySong(song);
        setIsPropertiesOpen(true);
    };

    const handleShowAlbum = async (song: SongMetadata) => {
        if (!song.album || !song.artist) return;

        // Fetch full library to find the album and its songs to avoid white screen
        const allSongs = await libraryService.getLibrarySongs();
        const albumSongs = allSongs.filter(s => s.album === song.album && s.artist === song.artist);

        if (albumSongs.length > 0) {
            push({
                type: 'album_detail',
                data: {
                    name: song.album,
                    artist: song.artist,
                    cover: albumSongs[0].cover || null,
                    cover_path: albumSongs[0].cover_path || null,
                    songs: albumSongs
                }
            });
        }
    };

    const handleShowArtist = async (song: SongMetadata) => {
        if (!song.artist) return;

        // Fetch full library to find the artist and their songs/albums to avoid white screen
        const allSongs = await libraryService.getLibrarySongs();
        const artistSongs = allSongs.filter(s => s.artist === song.artist);

        if (artistSongs.length > 0) {
            const albums = new Set(artistSongs.map(s => s.album));
            push({
                type: 'artist_detail',
                data: {
                    name: song.artist,
                    songs: artistSongs,
                    albumCount: albums.size,
                    count: artistSongs.length,
                    cover: artistSongs[0]?.cover || null
                }
            });
        }
    };

    return (
        <div className={clsx(
            "absolute bottom-full right-0 mb-4 w-80 max-h-96 rounded-2xl shadow-xl border overflow-hidden flex flex-col",
            "bg-white/95 dark:bg-[#2d2d2d]/95 backdrop-blur-md border-neutral-200 dark:border-neutral-700",
            "transition-all duration-200 origin-bottom-right z-[60]",
            show ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
        )}>
            {/* Properties Dialog */}
            <InfoDialog
                isOpen={isPropertiesOpen}
                onClose={() => setIsPropertiesOpen(false)}
                song={propertySong}
            />

            {/* 标题 */}
            <div className="p-4 border-b border-neutral-200/50 dark:border-neutral-700/50 bg-neutral-50/50 dark:bg-white/5">
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">播放队列</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    共 {playlist.length} 首歌曲
                </p>
            </div>

            {/* 列表 */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
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
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <MusicContextMenu
                                            type="song"
                                            variant="clean"
                                            buttonClassName="w-6 h-6"
                                            onPlay={() => handlePlay(song, index, { restartIfCurrent: true })}
                                            onAddToQueue={() => addToNext(song)}
                                            onAddToPlaylist={() => addToPlaylistStore.open(song)}
                                            onShowProperties={() => handleShowProperties(song)}
                                            onShowAlbum={song.album ? () => handleShowAlbum(song) : undefined}
                                            onShowArtist={song.artist ? () => handleShowArtist(song) : undefined}
                                            onDelete={() => removeSongFromPlaylistByIndex(index)}
                                            deleteText="从播放队列移除"
                                            deleteIcon={MdRemoveCircle}
                                            deleteVariant="default"
                                            onFavorite={() => toggleFavorite(song)}
                                            isFavorite={song.is_favorite}
                                            hideSelect
                                            onOpen={() => setContextMenu(null)}
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
                <CursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    menuGroups={getMusicMenuGroups({
                        type: 'song',
                        onPlay: () => handlePlay(contextMenu.song, contextMenu.index, { restartIfCurrent: true }),
                        onAddToQueue: () => addToNext(contextMenu.song),
                        onAddToPlaylist: () => addToPlaylistStore.open(contextMenu.song),
                        onShowProperties: () => handleShowProperties(contextMenu.song),
                        onShowAlbum: contextMenu.song.album ? () => handleShowAlbum(contextMenu.song) : undefined,
                        onShowArtist: contextMenu.song.artist ? () => handleShowArtist(contextMenu.song) : undefined,
                        onDelete: () => removeSongFromPlaylistByIndex(contextMenu.index),
                        deleteText: "从播放队列移除",
                        deleteIcon: MdRemoveCircle,
                        deleteVariant: 'default',
                        onFavorite: () => toggleFavorite(contextMenu.song),
                        isFavorite: contextMenu.song.is_favorite,
                        hideSelect: true
                    })}
                />
            )}
        </div>
    );
}