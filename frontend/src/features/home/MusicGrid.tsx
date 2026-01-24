import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';
import { IoFolderOpen, IoCheckbox, IoSquareOutline, IoHeart } from 'react-icons/io5';
import PageContainer from '../../components/layout/PageContainer';
import OpenFileMenu from './components/OpenFileMenu';
import EmptyState from './components/EmptyState';
import InfoDialog from '../../components/common/InfoDialog';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useSelectionStore } from '../../store/useSelectionStore';
import { useNavigationStore } from '../../store/useNavigationStore';
import { fileService } from '../../services/fileService';
import { libraryService } from '../../services/libraryService';
import { usePlaybackActions } from '../../hooks/usePlaybackActions';

import type { RecentItem } from '../../types';
import type { SongMetadata } from '../../types';
import MusicContextMenu, { getMusicMenuGroups } from '../../components/common/MusicContextMenu';
import type { MusicItemType } from '../../components/common/MusicContextMenu';
import CursorContextMenu from '../../components/common/CursorContextMenu';
import ConfirmDialog from '../../components/common/ConfirmDialog';
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

export default function MusicGrid({ onNavigateToLibrary }: MusicGridProps) {
    // Store Actions
    const { recentHistory, removeFromRecent, favoriteSet, refreshFavorites, libraryVersion } = useLibraryStore();
    const { playSong, playList, shufflePlay } = usePlaybackActions();
    const { push } = useNavigationStore();
    const { isSelectionMode, selectedIds, toggleSelectionMode, toggleSelection } = useSelectionStore();

    // 属性对话框状态
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [propertySong, setPropertySong] = useState<SongMetadata | null>(null);

    // 删除确认状态
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<RecentItem | null>(null);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: RecentItem } | null>(null);
    const [pathMap, setPathMap] = useState<Map<string, number>>(new Map()); // Path -> ID mapping for fast lookup

    const handleContextMenu = (e: React.MouseEvent, item: RecentItem) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, item });
    };

    // Sync Favorites & Path Map
    useEffect(() => {
        refreshFavorites();
        async function buildPathMap() {
            const all = await libraryService.scanLibrary();
            const map = new Map<string, number>();
            all.forEach(s => {
                if (s.path && s.id) map.set(s.path.replace(/[\\/]/g, '/').toLowerCase(), s.id);
            });
            setPathMap(map);
        }
        buildPathMap();
    }, [libraryVersion, refreshFavorites]);

    // Fast Lookup Helper
    const getLibraryId = (item: RecentItem): number | undefined => {
        if (item.type !== 'file') return undefined;
        const norm = item.path.replace(/[\\/]/g, '/').toLowerCase();
        return pathMap.get(norm);
    };

    const isItemFavorite = (item: RecentItem): boolean => {
        const id = getLibraryId(item);
        return id !== undefined && favoriteSet.has(id);
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

    // Core: Handle Recent Item Click
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

    // 随机播放逻辑
    const handleShufflePlay = async (item: RecentItem) => {
        let songs: SongMetadata[] = [];

        if (item.type === 'playlist') {
            const plIdStr = item.id.replace('playlist:', '');
            if (plIdStr === 'favorites') {
                songs = await libraryService.getFavorites();
            } else {
                const plId = parseInt(plIdStr);
                if (!isNaN(plId)) {
                    songs = await libraryService.getPlaylistSongs(plId);
                }
            }
        } else if (item.type === 'album') {
            const allSongs = await libraryService.scanLibrary();
            songs = allSongs.filter(s => s.album === item.title && (item.artist ? s.artist === item.artist : true));
        } else if (item.type === 'folder') {
            songs = await fileService.readFolder(item.path);
        }

        if (songs.length > 0) {
            await shufflePlay({
                songs,
                options: { recentItem: { ...item, lastPlayed: Date.now() } }
            });
        } else if (item.type === 'file') {
            handleItemClick(item);
        }
    };

    // 删除逻辑
    const handleDeleteClick = (item: RecentItem) => {
        setItemToDelete(item);
        setIsDeleteConfirmOpen(true);
    };

    const confirmDelete = () => {
        if (itemToDelete) {
            removeFromRecent(itemToDelete.id);
        }
        setIsDeleteConfirmOpen(false);
        setItemToDelete(null);
    };

    // 显示属性
    const handleShowProperties = async (item: RecentItem) => {
        if (item.type !== 'file') return;
        try {
            const meta = await fileService.getMetadata(item.path);
            setPropertySong(meta);
            setIsPropertiesOpen(true);
        } catch (e) {
            console.error('Failed to get metadata', e);
        }
    };

    // Favorite Logic for Recent Items
    const handleToggleFavorite = async (item: RecentItem) => {
        const id = getLibraryId(item);
        if (id) {
            await useLibraryStore.getState().toggleFavorite({ id } as SongMetadata);
        }
    };

    // Join Queue Wrapper in MusicGrid - Now "Play Next"
    const { addToNext } = useLibraryStore();
    const handleJoinQueue = async (item: RecentItem) => {
        if (item.type === 'file') {
            // Mock SongMetadata from RecentItem for simple adding
            const song: SongMetadata = {
                id: undefined, title: item.title, artist: item.artist || 'Unknown', album: item.description || 'Unknown',
                duration: 0, path: item.path, cover: item.cover, cover_path: item.cover_path
            };
            try {
                const meta = await fileService.getMetadata(item.path);
                if (meta) addToNext(meta); else addToNext(song);
            } catch { addToNext(song); }
        } else if (item.type === 'folder') {
            const songs = await fileService.readFolder(item.path);
            // Reverse to maintain order when adding to next (LIFO stack effect on "Next" position)
            [...songs].reverse().forEach(s => addToNext(s));
        } else if (item.type === 'album') {
            const allSongs = await libraryService.scanLibrary();
            const albumSongs = allSongs.filter(s => s.album === item.title && (item.artist ? s.artist === item.artist : true));
            [...albumSongs].reverse().forEach(s => addToNext(s));
        } else if (item.type === 'playlist') {
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
            [...songs].reverse().forEach(s => addToNext(s));
        }
    };

    // Navigation Helpers
    const handleNavigateToAlbum = async (item: RecentItem) => {
        onNavigateToLibrary?.();
        const allSongs = await libraryService.scanLibrary();
        let albumName = "";
        let artistName = item.artist;

        if (item.type === 'file') {
            // Find song in library to get real album name
            // Normalize paths for comparison (Windows drive letters can be inconsistent)
            const normalizedPath = (item.path || '').toLowerCase().replace(/[\\/]/g, '/');
            const song = allSongs.find(s => (s.path || '').toLowerCase().replace(/[\\/]/g, '/') === normalizedPath);
            if (song) {
                albumName = song.album || "Unknown Album";
                artistName = song.artist || "Unknown Artist";
            } else {
                console.warn("Song not found in library during navigation attempt", item);
                alert("无法在媒体库中找到该歌曲，无法跳转到专辑。");
                return;
            }
        } else {
            albumName = item.title;
        }

        // Filter songs for this album
        const albumSongs = allSongs.filter(s => {
            const sAlbum = s.album || "Unknown Album";
            const tAlbum = albumName || "Unknown Album";
            // If we have a target artist, match it
            if (artistName) {
                const sArtist = s.artist || "Unknown Artist";
                const tArtist = artistName || "Unknown Artist";
                return sAlbum === tAlbum && sArtist === tArtist;
            }
            return sAlbum === tAlbum;
        });

        if (albumSongs.length === 0) {
            console.warn("No songs found for album", albumName);
            alert(`无法找到专辑 "${albumName}" 的相关歌曲。`);
            return;
        }

        // Construct AlbumData
        const albumData = {
            name: albumName,
            artist: artistName || "Unknown",
            cover: albumSongs[0]?.cover || null, // Use cover from first song in album
            songs: albumSongs
        };
        push({ type: 'album_detail', data: albumData });
    };

    const handleNavigateToArtist = async (item: RecentItem) => {
        onNavigateToLibrary?.();
        const allSongs = await libraryService.scanLibrary();
        let artistName = item.artist || "Unknown";

        if (item.type === 'file') {
            // Optionally verify artist from library if needed, but item.artist should be reliable if set
            // But to be safe:
            const normalizedPath = (item.path || '').toLowerCase().replace(/[\\/]/g, '/');
            const song = allSongs.find(s => (s.path || '').toLowerCase().replace(/[\\/]/g, '/') === normalizedPath);
            if (song && song.artist) {
                artistName = song.artist;
            }
        }

        const artistSongs = allSongs.filter(s => s.artist === artistName);

        if (artistSongs.length === 0) {
            console.warn("No songs found for artist", artistName);
            alert(`无法找到艺人 "${artistName}" 的相关歌曲。`);
            return;
        }

        const artistData = {
            name: artistName,
            cover: artistSongs[0]?.cover || null,
            count: artistSongs.length,
            albumCount: new Set(artistSongs.map(s => s.album)).size,
            songs: artistSongs
        };
        push({ type: 'artist_detail', data: artistData });
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

    const getMusicType = (item: RecentItem): MusicItemType => {
        if (item.type === 'playlist') return 'playlist';
        if (item.type === 'file') {
            // Distinguish between library songs and raw files
            return item.isLibraryItem ? 'song' : 'file';
        }
        if (item.type === 'album') return 'album';
        if (item.type === 'folder') return 'folder';
        return 'song';
    }

    return (
        <PageContainer
            title="主页"
            actions={<OpenFileMenu onOpenFile={handleOpenFile} onOpenFolder={handleOpenFolder} />}
        >
            <InfoDialog
                isOpen={isPropertiesOpen}
                onClose={() => setIsPropertiesOpen(false)}
                song={propertySong}
            />

            <ConfirmDialog
                isOpen={isDeleteConfirmOpen}
                onClose={() => setIsDeleteConfirmOpen(false)}
                onConfirm={confirmDelete}
                title="删除"
                description={`确定要删除 "${itemToDelete?.title}" 吗？`}
                confirmText="删除"
                type="danger"
            />

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
                                            <IoFolderOpen className="text-6xl text-blue-400 opacity-80" />
                                        ) : item.type === 'playlist' ? (
                                            item.id === 'playlist:favorites' ? (
                                                <div className="w-full h-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
                                                    <IoHeart className="text-6xl text-white drop-shadow-md" />
                                                </div>
                                            ) : item.cover_path ? (
                                                <CoverImage src={item.cover_path} className="w-full h-full" />
                                            ) : (
                                                <PlaylistGridCover item={item} />
                                            )
                                        ) : (
                                            <CoverImage
                                                // Construct a minimal SongMetadata for CoverImage
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

                                        {/* Selection Dimming Overlay */}
                                        {isSelected && (
                                            <div className="absolute inset-0 bg-black/40 z-10 transition-opacity duration-300" />
                                        )}

                                        {/* Selection Checkbox Overlay */}
                                        {isSelectionMode && (
                                            <div className="absolute top-2 left-2 z-20">
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); toggleSelection(item.id, item.type, item); }}
                                                    className="w-6 h-6 rounded bg-white/40 backdrop-blur-sm flex items-center justify-center hover:bg-white/60 transition-colors"
                                                >
                                                    {isSelected
                                                        ? <IoCheckbox className="text-primary text-xl" />
                                                        : <IoSquareOutline className="text-neutral-700 text-xl" />
                                                    }
                                                </div>
                                            </div>
                                        )}

                                        {/* 交互遮罩 - In Selection Mode, disable hover effects related to play */}
                                        {!isSelectionMode && (
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                {/* Play Button */}
                                                <CardPlayButton onClick={() => handleItemClick(item)} className="bottom-3 left-3" />

                                                {/* Menu Button */}
                                                <MusicContextMenu
                                                    className="absolute bottom-3 right-3"
                                                    buttonClassName="w-10 h-10"
                                                    type={getMusicType(item)}
                                                    onPlay={() => handleItemClick(item)}
                                                    onShuffle={() => handleShufflePlay(item)}
                                                    onAddToQueue={() => handleJoinQueue(item)}
                                                    // Only show AddToPlaylist if it's a library item (Album or Song in Library)
                                                    onAddToPlaylist={(item.type === 'album' || (item.type === 'file' && item.isLibraryItem)) ? () => { console.log('Add to playlist', item) } : undefined}
                                                    onShowProperties={item.type === 'file' ? () => handleShowProperties(item) : undefined}
                                                    onShowAlbum={item.type === 'file' || item.type === 'album' ? () => handleNavigateToAlbum(item) : undefined}
                                                    onShowArtist={item.artist && (item.type === 'file' || item.type === 'album') ? () => handleNavigateToArtist(item) : undefined}
                                                    onDelete={() => handleDeleteClick(item)}
                                                    deleteText="删除"
                                                    onSelect={() => toggleSelectionMode({ id: item.id, type: item.type, data: item })}
                                                    onOpen={() => setContextMenu(null)}
                                                    // Note: Favorites require song ID, which RecentItem (file) might not have. Disabling for now.
                                                    onFavorite={item.type === 'file' && item.isLibraryItem ? () => handleToggleFavorite(item) : undefined}
                                                    isFavorite={isItemFavorite(item)}
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

                {/* Cursor Context Menu */}
                {contextMenu && (
                    <CursorContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        onClose={() => setContextMenu(null)}
                        menuGroups={getMusicMenuGroups({
                            type: getMusicType(contextMenu.item),
                            onPlay: () => handleItemClick(contextMenu.item),
                            onShuffle: () => handleShufflePlay(contextMenu.item),
                            onAddToQueue: () => handleJoinQueue(contextMenu.item),
                            // Only show AddToPlaylist if it's a library item (Album or Song in Library)
                            onAddToPlaylist: (contextMenu.item.type === 'album' || (contextMenu.item.type === 'file' && contextMenu.item.isLibraryItem)) ? () => { console.log('Add to playlist', contextMenu.item) } : undefined,
                            onShowProperties: contextMenu.item.type === 'file' ? () => handleShowProperties(contextMenu.item) : undefined,
                            onShowAlbum: contextMenu.item.type === 'file' || contextMenu.item.type === 'album' ? () => handleNavigateToAlbum(contextMenu.item) : undefined,
                            onShowArtist: contextMenu.item.artist && (contextMenu.item.type === 'file' || contextMenu.item.type === 'album') ? () => handleNavigateToArtist(contextMenu.item) : undefined,
                            onDelete: () => handleDeleteClick(contextMenu.item),
                            deleteText: "删除",
                            onSelect: () => toggleSelectionMode({ id: contextMenu.item.id, type: contextMenu.item.type, data: contextMenu.item }),
                            onFavorite: contextMenu.item.type === 'file' && contextMenu.item.isLibraryItem ? () => handleToggleFavorite(contextMenu.item) : undefined,
                            isFavorite: isItemFavorite(contextMenu.item)
                        })}
                    />
                )}
            </section>
        </PageContainer>
    );
}