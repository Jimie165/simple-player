import { useState } from 'react';
import clsx from 'clsx';
import { IoMusicalNotes, IoPlay, IoRemoveCircleOutline } from 'react-icons/io5';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { usePlayerStore } from '../../../store/usePlayerStore';
import { useNavigationStore } from '../../../store/useNavigationStore';
import { audioService } from '../../../services/audioService';
import type { SongMetadata } from '../../../types';
import MusicContextMenu, { getMusicMenuGroups } from '../../../components/common/MusicContextMenu';
import CursorContextMenu from '../../../components/common/CursorContextMenu';
import InfoDialog from '../../../components/common/InfoDialog';

interface PlayQueuePopupProps {
    show: boolean;
}

export default function PlayQueuePopup({ show }: PlayQueuePopupProps) {
    const { playlist, currentSongIndex, setCurrentSongIndex, removeSongFromPlaylist, addToNext } = useLibraryStore();
    const { setMetadata, setIsPlaying } = usePlayerStore();
    const { push } = useNavigationStore();

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: SongMetadata; index: number } | null>(null);

    // Properties dialog state
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [propertySong, setPropertySong] = useState<SongMetadata | null>(null);

    const handlePlay = async (song: SongMetadata, index: number) => {
        if (!song.path) return;
        setCurrentSongIndex(index);
        try {
            setMetadata(song);
            await audioService.play(song.path, song);
            setIsPlaying(true);
        } catch (error) {
            console.error(error);
        }
    };

    const handleRemoveFromQueue = (song: SongMetadata) => {
        if (song.path) {
            removeSongFromPlaylist(song.path);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, song: SongMetadata, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, song, index });
    };

    const handleShowProperties = (song: SongMetadata) => {
        setPropertySong(song);
        setIsPropertiesOpen(true);
    };

    const handleShowAlbum = (song: SongMetadata) => {
        if (song.album) {
            push({ type: 'album_detail', data: { name: song.album } });
        }
    };

    const handleShowArtist = (song: SongMetadata) => {
        if (song.artist) {
            push({ type: 'artist_detail', data: { name: song.artist } });
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
                        <IoMusicalNotes className="text-3xl mb-2 opacity-20" />
                        <span>队列为空</span>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {playlist.map((song, index) => {
                            const isCurrent = index === currentSongIndex;
                            return (
                                <div
                                    key={index}
                                    onDoubleClick={() => handlePlay(song, index)}
                                    onContextMenu={(e) => handleContextMenu(e, song, index)}
                                    className={clsx(
                                        "group flex items-center gap-3 p-2 rounded-lg text-xs cursor-default transition-colors",
                                        isCurrent
                                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                            : "hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-200"
                                    )}
                                >
                                    <div className="w-5 text-center shrink-0 font-medium opacity-60">
                                        {isCurrent ? <IoPlay /> : index + 1}
                                    </div>

                                    <div className="flex-1 flex flex-col min-w-0">
                                        <span className="truncate font-medium">{song.title || "Unknown Title"}</span>
                                        <span className="truncate text-[10px] opacity-70">{song.artist || "Unknown Artist"}</span>
                                    </div>

                                    {/* Three dots menu button */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        <MusicContextMenu
                                            type="song"
                                            variant="clean"
                                            buttonClassName="w-6 h-6"
                                            onPlay={() => handlePlay(song, index)}
                                            onAddToQueue={() => addToNext(song)}
                                            onAddToPlaylist={() => console.log('Add to playlist', song)}
                                            onShowProperties={() => handleShowProperties(song)}
                                            onShowAlbum={song.album ? () => handleShowAlbum(song) : undefined}
                                            onShowArtist={song.artist ? () => handleShowArtist(song) : undefined}
                                            onDelete={() => handleRemoveFromQueue(song)}
                                            deleteText="从播放队列移除"
                                            deleteIcon={IoRemoveCircleOutline}
                                            deleteVariant="default"
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
                <CursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    menuGroups={getMusicMenuGroups({
                        type: 'song',
                        onPlay: () => handlePlay(contextMenu.song, contextMenu.index),
                        onAddToQueue: () => addToNext(contextMenu.song),
                        onAddToPlaylist: () => console.log('Add to playlist', contextMenu.song),
                        onShowProperties: () => handleShowProperties(contextMenu.song),
                        onShowAlbum: contextMenu.song.album ? () => handleShowAlbum(contextMenu.song) : undefined,
                        onShowArtist: contextMenu.song.artist ? () => handleShowArtist(contextMenu.song) : undefined,
                        onDelete: () => handleRemoveFromQueue(contextMenu.song),
                        deleteText: "从播放队列移除",
                        deleteIcon: IoRemoveCircleOutline,
                        deleteVariant: 'default',
                        hideSelect: true
                    })}
                />
            )}
        </div>
    );
}