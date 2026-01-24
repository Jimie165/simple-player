import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';
import { MdFolder, MdCheckBox, MdCheckBoxOutlineBlank, MdFavorite } from 'react-icons/md';
import PageContainer from '../../components/layout/PageContainer';
import OpenFileMenu from './components/OpenFileMenu';
import EmptyState from './components/EmptyState';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useSelectionStore } from '../../store/useSelectionStore';
import { fileService } from '../../services/fileService';
import { libraryService } from '../../services/libraryService';
import { usePlaybackActions } from '../../hooks/usePlaybackActions';

import type { RecentItem } from '../../types';
import type { SongMetadata } from '../../types';
import SmartMusicContextMenu from '../../components/common/SmartMusicContextMenu';
import SmartCursorContextMenu from '../../components/common/SmartCursorContextMenu';
import CoverImage from '../../components/common/CoverImage';
import PlaylistCoverCollage from '../../components/common/PlaylistCoverCollage';
import { sortSongs } from '../../utils/songSort';

import CardPlayButton from '../../components/common/CardPlayButton';

interface MusicGridProps {
    onNavigateToLibrary?: () => void;
}

/**
 * 专门为最近播放列表定义的封面组件，负责内部加载歌曲数据以生成拼接封面
 */
function PlaylistGridCover({ item }: { item: RecentItem }) {
    const [songs, setSongs] = useState<SongMetadata[]>([]);
    const { getPlaylistSettings } = useLibraryStore();

    useEffect(() => {
        const load = async () => {
            const plIdStr = item.id.replace('playlist:', '');
            let plSongs: SongMetadata[] = [];
            if (plIdStr === 'favorites') {
                plSongs = await libraryService.getFavorites();
            } else {
                const plId = parseInt(plIdStr);
                if (!isNaN(plId)) {
                    const raw = await libraryService.getPlaylistSongs(plId);
                    const settings = getPlaylistSettings(plIdStr);
                    plSongs = sortSongs(raw, settings.sortKey, settings.sortOrder);
                }
            }
            setSongs(plSongs);
        };
        load();
    }, [item.id, getPlaylistSettings]);

    return <PlaylistCoverCollage songs={songs} className="w-full h-full" />;
}

export default function MusicGrid({ onNavigateToLibrary: _onNavigateToLibrary }: MusicGridProps) {
    // Store Actions
    const { recentHistory } = useLibraryStore();
    const { playSong, playList } = usePlaybackActions();
    const { isSelectionMode, selectedIds, toggleSelection, toggleSelectionMode } = useSelectionStore();

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: RecentItem } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, item: RecentItem) => {
        e.preventDefault();
        document.body.click();
        setContextMenu({ x: e.clientX, y: e.clientY, item });
    };

    // Helper: Play Single File
    const buildRecentForFile = (path: string, meta: SongMetadata, isLibraryItem: boolean, existing?: RecentItem): RecentItem => {
        if (existing) {
            return { ...existing, lastPlayed: Date.now() };
        }
        return {
            id: path,
            type: 'file',
            title: meta.title,
            description: meta.artist,
            cover: meta.cover || null,
            cover_path: meta.cover_path || null,
            path,
            lastPlayed: Date.now(),
            artist: meta.artist,
            isLibraryItem
        };
    };

    const playSingleFile = async (path: string, isLibraryItem = false, existingRecent?: RecentItem) => {
        try {
            let meta: SongMetadata | null = null;
            try { meta = await fileService.getMetadata(path); } catch { /* ignore metadata errors */ }

            const safeMeta = meta || {
                title: path.split(/[\\/]/).pop() || 'Unknown',
                artist: 'Unknown Artist', album: 'Unknown Album', duration: 0, cover: null, path: path
            };

            await playSong({
                song: safeMeta,
                index: 0,
                playlist: [safeMeta],
                options: {
                    restartIfCurrent: true,
                    recentItem: buildRecentForFile(path, safeMeta, isLibraryItem, existingRecent)
                }
            });
        } catch (err) { console.error("Play single file failed", err); }
    };

    // Core: Handle Recent Item Click (Primary Action)
    const handleItemClick = async (item: RecentItem, e?: React.MouseEvent) => {
        const id = item.id;

        // Selection Mode Logic
        if (isSelectionMode) {
            e?.stopPropagation();
            toggleSelection(id, item.type, item);
            return;
        }

        // Helper to play a list
        const playListHelper = async (songs: SongMetadata[]) => {
            if (songs.length === 0) return;
            const firstSong = songs[0];
            if (!firstSong.path) return;

            await playList({
                songs,
                startIndex: 0,
                options: {
                    restartIfCurrent: true,
                    recentItem: { ...item, lastPlayed: Date.now() }
                }
            });
        };

        // Normal Playback Logic
        if (item.type === 'folder') {
            try {
                const songs = await fileService.readFolder(item.path);
                await playListHelper(songs);
            } catch (e) {
                console.error("Failed to play folder", e);
            }
        } else if (item.type === 'album') {
            try {
                const allSongs = await libraryService.scanLibrary();
                const albumSongs = allSongs.filter(s =>
                    s.album === item.title &&
                    (item.artist ? s.artist === item.artist : true)
                );
                await playListHelper(albumSongs);
            } catch (err) {
                console.error("Failed to play recent album", err);
            }
        } else if (item.type === 'playlist') {
            try {
                // Parse ID "playlist:123" -> 123
                const plIdStr = item.id.replace('playlist:', '');
                let songs: SongMetadata[] = [];

                if (plIdStr === 'favorites') {
                    songs = await libraryService.getFavorites();
                } else {
                    const plId = parseInt(plIdStr);
                    if (!isNaN(plId)) {
                        const rawSongs = await libraryService.getPlaylistSongs(plId);
                        const { getPlaylistSettings } = useLibraryStore.getState();
                        const settings = getPlaylistSettings(plIdStr);
                        songs = sortSongs(rawSongs, settings.sortKey, settings.sortOrder);
                    }
                }
                await playListHelper(songs);
            } catch (err) {
                console.error("Failed to play recent playlist", err);
            }
        } else {
            playSingleFile(item.path, item.isLibraryItem, item);
        }
    };

    const handleOpenFolder = async () => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
                const songs = await fileService.readFolder(selected);
                if (songs.length === 0) return;
                const folderName = selected.split(/[\\/]/).pop() || "Unknown Folder";
                await playList({
                    songs,
                    startIndex: 0,
                    options: {
                        restartIfCurrent: true,
                        recentItem: {
                            id: selected,
                            type: 'folder',
                            title: folderName,
                            description: `${songs.length} 首歌曲`,
                            cover: songs[0]?.cover || null,
                            cover_path: songs[0]?.cover_path || null,
                            path: selected,
                            lastPlayed: Date.now()
                        }
                    }
                });
            }
        } catch (err) {
            console.error('Failed to open folder:', err);
        }
    };

    const handleOpenFile = async () => {
        const selected = await open({
            multiple: false,
            filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a'] }]
        });
        if (selected && typeof selected === 'string') {
            playSingleFile(selected);
        }
    };

    return (
        <PageContainer
            title="主页"
            actions={<OpenFileMenu onOpenFile={handleOpenFile} onOpenFolder={handleOpenFolder} />}
        >
            <section>
                <h2 className="mb-4 text-xl font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                    <span>最近使用</span>
                </h2>

                {recentHistory.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                        {recentHistory.map((item) => {
                            const isSelected = selectedIds.has(item.id);

                            return (
                                <div
                                    key={item.id}
                                    className="group flex flex-col gap-3 rounded-2xl p-4 -mx-4 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer relative"
                                    onClick={(e) => handleItemClick(item, e)}
                                    onContextMenu={(e) => handleContextMenu(e, item)}
                                >
                                    <div className="aspect-square w-full rounded-2xl shadow-sm bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative border border-black/5 dark:border-white/5 flex items-center justify-center">
                                        {item.type === 'folder' ? (
                                            <MdFolder className="text-6xl text-blue-400 opacity-80" />
                                        ) : item.type === 'playlist' ? (
                                            item.id === 'playlist:favorites' ? (
                                                <div className="w-full h-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
                                                    <MdFavorite className="text-6xl text-white drop-shadow-md" />
                                                </div>
                                            ) : item.cover_path ? (
                                                <CoverImage src={item.cover_path} className="w-full h-full" />
                                            ) : (
                                                <PlaylistGridCover item={item} />
                                            )
                                        ) : (
                                            <CoverImage
                                                song={{
                                                    title: item.title,
                                                    artist: item.artist || '',
                                                    album: '',
                                                    duration: 0,
                                                    path: item.path,
                                                    cover: item.cover,
                                                    cover_path: item.cover_path
                                                }}
                                                className="w-full h-full group-hover:scale-[1.02] transition-transform duration-500 ease-out"
                                                iconClassName="text-6xl opacity-50"
                                            />
                                        )}

                                        {isSelected && (
                                            <div className="absolute inset-0 bg-black/40 z-10 transition-opacity duration-300" />
                                        )}

                                        {isSelectionMode && (
                                            <div className="absolute top-2 left-2 z-20">
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); toggleSelection(item.id, item.type, item); }}
                                                    className="w-6 h-6 rounded bg-white/40 backdrop-blur-sm flex items-center justify-center hover:bg-white/60 transition-colors"
                                                >
                                                    {isSelected
                                                        ? <MdCheckBox className="text-primary text-xl" />
                                                        : <MdCheckBoxOutlineBlank className="text-neutral-700 text-xl" />
                                                    }
                                                </div>
                                            </div>
                                        )}

                                        {!isSelectionMode && (
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                <CardPlayButton onClick={() => handleItemClick(item)} className="bottom-3 left-3" />
                                                <SmartMusicContextMenu
                                                    className="absolute bottom-3 right-3"
                                                    buttonClassName="w-10 h-10"
                                                    items={item}
                                                    context="recent"
                                                    onPlay={() => handleItemClick(item)}
                                                    isSelected={isSelected}
                                                    onSelect={() => isSelectionMode
                                                        ? toggleSelection(item.id, item.type, item)
                                                        : toggleSelectionMode({ id: item.id, type: item.type, data: item })
                                                    }
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-0.5 px-1">
                                        <span className={clsx(
                                            "truncate text-base font-semibold",
                                            isSelected ? "text-primary" : "text-neutral-900 dark:text-neutral-50"
                                        )} title={item.title}>
                                            {item.title}
                                        </span>
                                        <span className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={item.description}>
                                            {item.description}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {contextMenu && (
                    <SmartCursorContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        item={contextMenu.item}
                        context="recent"
                        onClose={() => setContextMenu(null)}
                        isSelected={selectedIds.has(contextMenu.item.id)}
                        onSelect={() => {
                            const { id, type } = contextMenu.item;
                            if (isSelectionMode) {
                                toggleSelection(id, type, contextMenu.item);
                            } else {
                                toggleSelectionMode({ id, type, data: contextMenu.item });
                            }
                            setContextMenu(null);
                        }}
                    />
                )}
            </section>
        </PageContainer>
    );
}