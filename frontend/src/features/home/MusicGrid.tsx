import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import PageContainer from '../../components/layout/PageContainer';
import OpenFileMenu from './components/OpenFileMenu';
import RecentItemCard from './components/RecentItemCard';
import EmptyState from './components/EmptyState';
import InfoDialog from '../../components/common/InfoDialog';

import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { audioService } from '../../services/audioService';
import { fileService } from '../../services/fileService';
import { libraryService } from '../../services/libraryService';
import type { SongMetadata, RecentItem } from '../../types';

export default function MusicGrid() {
    // Store Actions
    const { recentHistory, addToRecent, removeFromRecent, setPlaylist, setCurrentSongIndex, toggleShuffleList } = useLibraryStore();
    const { setIsPlaying, setMetadata, setShuffleState } = usePlayerStore();

    // 属性对话框状态
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [propertySong, setPropertySong] = useState<SongMetadata | null>(null);

    // Helper: Play Single File
    const playSingleFile = async (path: string) => {
        try {
            let meta: SongMetadata | null = null;
            try { meta = await fileService.getMetadata(path); } catch (e) { }

            const safeMeta = meta || {
                title: path.split(/[\\/]/).pop() || 'Unknown',
                artist: 'Unknown Artist', album: 'Unknown Album', duration: 0, cover: null, path: path
            };

            // 1. Set Playlist (Single item)
            setPlaylist([safeMeta]);

            // 2. Ensure Shuffle is OFF
            setShuffleState(false);
            toggleShuffleList(false);

            // 3. Play
            setCurrentSongIndex(0);
            setMetadata(safeMeta);
            await audioService.play(path, safeMeta);
            setIsPlaying(true);
        } catch (err) { console.error(err); }
    };

    // Core: Handle Recent Item Click
    const handleItemClick = async (item: RecentItem) => {
        if (item.type === 'folder') {
            try {
                // Get songs from folder (returns SongMetadata[] directly)
                const songs = await fileService.readFolder(item.path);

                if (songs.length === 0) return;

                // Set Playlist
                setPlaylist(songs);

                // Turn OFF Shuffle (Folders usually play in order)
                setShuffleState(false);
                toggleShuffleList(false);

                // Play First Song
                setCurrentSongIndex(0);
                const firstSong = songs[0];
                if (firstSong.path) {
                    setMetadata(firstSong);
                    await audioService.play(firstSong.path, firstSong);
                    setIsPlaying(true);
                }

                // Update Recent Timestamp
                addToRecent({
                    ...item,
                    lastPlayed: Date.now()
                });

            } catch (e) {
                console.error("Failed to play folder", e);
            }
        } else if (item.type === 'album') {
            try {
                // Determine artist from item (might be in description or extra field)
                // In types, we added artist optional field.

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

                    // Update timestamp
                    addToRecent({
                        ...item,
                        lastPlayed: Date.now()
                    });
                }
            } catch (e) {
                console.error("Failed to play recent album", e);
            }
        } else {
            // Single File
            playSingleFile(item.path);
        }
    };

    // 删除最近使用项
    const handleDeleteRecent = (item: RecentItem) => {
        removeFromRecent(item.id);
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

    // Handle "Open Folder" Button
    const handleOpenFolder = async () => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
                // Fetch songs (now returns SongMetadata[] directly)
                const songs = await fileService.readFolder(selected);

                if (songs.length === 0) return;

                // Set Playlist
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

                // Add Folder to Recent
                const folderName = selected.split(/[\\/]/).pop() || "Unknown Folder";
                addToRecent({
                    id: selected,
                    type: 'folder',
                    title: folderName,
                    description: `${songs.length} 首歌曲`,
                    cover: songs[0]?.cover || null,
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

            <section>
                <h2 className="mb-4 text-xl font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                    <span>最近使用</span>
                </h2>

                {recentHistory.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                        {recentHistory.map((item) => (
                            <RecentItemCard
                                key={item.id}
                                item={item}
                                onClick={() => handleItemClick(item)}
                                onDelete={handleDeleteRecent}
                                onShowProperties={handleShowProperties}
                            />
                        ))}
                    </div>
                )}
            </section>
        </PageContainer>
    );
}