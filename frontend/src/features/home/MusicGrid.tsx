import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { IoFolderOpen } from 'react-icons/io5';
import PageContainer from '../../components/layout/PageContainer';
import OpenFileMenu from './components/OpenFileMenu';
import EmptyState from './components/EmptyState';
import InfoDialog from '../../components/common/InfoDialog';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import CoverImage from '../../components/common/CoverImage';

import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useNavigationStore } from '../../store/useNavigationStore';
import { audioService } from '../../services/audioService';
import { fileService } from '../../services/fileService';
import { libraryService } from '../../services/libraryService';
import type { SongMetadata, RecentItem } from '../../types';
import CardPlayButton from '../../components/common/CardPlayButton';
import MusicContextMenu from '../../components/common/MusicContextMenu';
import type { MusicItemType } from '../../components/common/MusicContextMenu';

export default function MusicGrid() {
    // Store Actions
    const { recentHistory, addToRecent, removeFromRecent, setPlaylist, setCurrentSongIndex, toggleShuffleList, addToPlaylist } = useLibraryStore();
    const { setIsPlaying, setMetadata, setShuffleState } = usePlayerStore();
    const { push } = useNavigationStore();

    // 属性对话框状态
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [propertySong, setPropertySong] = useState<SongMetadata | null>(null);

    // 删除确认状态
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<RecentItem | null>(null);

    // Helper: Play Single File
    const playSingleFile = async (path: string) => {
        try {
            let meta: SongMetadata | null = null;
            try { meta = await fileService.getMetadata(path); } catch (e) { }

            const safeMeta = meta || {
                title: path.split(/[\\/]/).pop() || 'Unknown',
                artist: 'Unknown Artist', album: 'Unknown Album', duration: 0, cover: null, path: path
            };

            setPlaylist([safeMeta]);
            setShuffleState(false);
            toggleShuffleList(false);
            setCurrentSongIndex(0);
            setMetadata(safeMeta);
            await audioService.play(path, safeMeta);
            setIsPlaying(true);

            // Add to Recent (File Type)
            addToRecent({
                id: path,
                type: 'file',
                title: safeMeta.title,
                description: safeMeta.artist,
                cover: safeMeta.cover,
                path: path,
                lastPlayed: Date.now(),
                artist: safeMeta.artist
            });
        } catch (err) { console.error(err); }
    };

    // Core: Handle Recent Item Click
    const handleItemClick = async (item: RecentItem) => {
        if (item.type === 'folder') {
            try {
                const songs = await fileService.readFolder(item.path);
                if (songs.length === 0) return;
                setPlaylist(songs);
                setShuffleState(false);
                toggleShuffleList(false);
                setCurrentSongIndex(0);
                const firstSong = songs[0];
                if (firstSong.path) {
                    setMetadata(firstSong);
                    await audioService.play(firstSong.path, firstSong);
                    setIsPlaying(true);
                }
                addToRecent({ ...item, lastPlayed: Date.now() });
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

                if (albumSongs.length > 0) {
                    setPlaylist(albumSongs);
                    setShuffleState(false);
                    toggleShuffleList(false);
                    setCurrentSongIndex(0);
                    const first = albumSongs[0];
                    if (first.path) {
                        setMetadata(first);
                        await audioService.play(first.path, first);
                        setIsPlaying(true);
                    }
                    addToRecent({ ...item, lastPlayed: Date.now() });
                }
            } catch (e) {
                console.error("Failed to play recent album", e);
            }
        } else {
            playSingleFile(item.path);
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

    // Join Queue Wrapper in MusicGrid
    const handleJoinQueue = async (item: RecentItem) => {
        if (item.type === 'file') {
            // Mock SongMetadata from RecentItem for simple adding
            const song: SongMetadata = {
                id: undefined, title: item.title, artist: item.artist || 'Unknown', album: item.description || 'Unknown',
                duration: 0, path: item.path, cover: item.cover, cover_path: item.cover_path
            };
            try {
                const meta = await fileService.getMetadata(item.path);
                if (meta) addToPlaylist(meta);
            } catch (e) { addToPlaylist(song); }
        } else if (item.type === 'folder') {
            const songs = await fileService.readFolder(item.path);
            songs.forEach(s => addToPlaylist(s));
        } else if (item.type === 'album') {
            const allSongs = await libraryService.scanLibrary();
            const albumSongs = allSongs.filter(s => s.album === item.title && (item.artist ? s.artist === item.artist : true));
            albumSongs.forEach(s => addToPlaylist(s));
        }
    };

    // Navigation Helpers
    const handleNavigateToAlbum = async (item: RecentItem) => {
        const allSongs = await libraryService.scanLibrary();
        const albumSongs = allSongs.filter(s => s.album === item.title && (item.artist ? s.artist === item.artist : true));
        // Construct AlbumData
        const albumData = {
            name: item.title,
            artist: item.artist || "Unknown",
            cover: item.cover,
            songs: albumSongs
        };
        push({ type: 'album_detail', data: albumData });
    };

    const handleNavigateToArtist = async (item: RecentItem) => {
        // Need full artist data which implies songs etc.
        // This is heavy if we scan library every time.
        // But for now it ensures consistency.
        const allSongs = await libraryService.scanLibrary();
        const artistName = item.artist || "Unknown";
        const artistSongs = allSongs.filter(s => s.artist === artistName);
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
                setPlaylist(songs);
                setShuffleState(false);
                toggleShuffleList(false);
                setCurrentSongIndex(0);
                const firstSong = songs[0];
                if (firstSong.path) {
                    setMetadata(firstSong);
                    await audioService.play(firstSong.path, firstSong);
                    setIsPlaying(true);
                }
                const folderName = selected.split(/[\\/]/).pop() || "Unknown Folder";
                addToRecent({
                    id: selected,
                    type: 'folder',
                    title: folderName,
                    description: `${songs.length} 首歌曲`,
                    cover: songs[0]?.cover || null,
                    cover_path: songs[0]?.cover_path || null,
                    path: selected,
                    lastPlayed: Date.now()
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

    const getMusicType = (itemType: string): MusicItemType => {
        if (itemType === 'file') return 'song';
        if (itemType === 'album') return 'album';
        if (itemType === 'folder') return 'folder';
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
                title="删除记录"
                description={`确定要删除 "${itemToDelete?.title}" 的播放记录吗？这将不会删除本地文件。`}
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
                        {recentHistory.map((item) => (
                            <div
                                key={item.id}
                                className="group flex flex-col gap-3 rounded-2xl p-4 -mx-4 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                onClick={() => handleItemClick(item)}
                            >
                                <div className="aspect-square w-full rounded-2xl shadow-sm bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative border border-black/5 dark:border-white/5 flex items-center justify-center">
                                    {item.type === 'folder' ? (
                                        <IoFolderOpen className="text-6xl text-blue-400 opacity-80" />
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

                                    {/* 交互遮罩 */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        {/* Play Button */}
                                        <CardPlayButton onClick={() => handleItemClick(item)} className="bottom-3 left-3" />

                                        {/* Menu Button */}
                                        <MusicContextMenu
                                            className="absolute bottom-3 right-3"
                                            buttonClassName="w-10 h-10"
                                            type={getMusicType(item.type)}
                                            onPlay={() => handleItemClick(item)}
                                            onAddToQueue={() => handleJoinQueue(item)}
                                            onShowProperties={item.type === 'file' ? () => handleShowProperties(item) : undefined}
                                            onShowAlbum={(item.type === 'album' || (item.type === 'file' && item.isLibraryItem)) ? () => handleNavigateToAlbum(item) : undefined}
                                            onShowArtist={(item.artist && (item.type === 'album' || item.isLibraryItem)) ? () => handleNavigateToArtist(item) : undefined}
                                            onDelete={() => handleDeleteClick(item)}
                                            deleteText="删除"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-0.5 px-1">
                                    <span className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-50" title={item.title}>
                                        {item.title}
                                    </span>
                                    <span className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={item.description}>
                                        {item.description}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </PageContainer>
    );
}