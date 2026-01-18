import { open } from '@tauri-apps/plugin-dialog';
import PageContainer from '../../components/layout/PageContainer';
import OpenFileMenu from './components/OpenFileMenu';
import RecentItemCard from './components/RecentItemCard';
import EmptyState from './components/EmptyState';

import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { audioService } from '../../services/audioService';
import { fileService } from '../../services/fileService';
import type { SongMetadata } from '../../types';

export default function MusicGrid() {
    // Store Actions
    const { recentHistory, addToRecent, setPlaylist, setCurrentSongIndex, toggleShuffleList } = useLibraryStore();
    const { setIsPlaying, setMetadata, setShuffleState } = usePlayerStore();

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
    const handleItemClick = async (item: typeof recentHistory[0]) => {
        if (item.type === 'folder') {
            try {
                // 1. Get songs from folder
                // Note: fileService.readFolder should return paths? 
                // Wait, you added `getSongsInFolder` earlier. We should use that to get Metadata directly.
                // If you use `readFolder`, you get paths, then map. 
                // Assuming you have `getSongsInFolder` (best practice):

                // If you don't have getSongsInFolder implemented yet, use this loop:
                const files = await fileService.readFolder(item.path);
                const songs: SongMetadata[] = [];
                for (const file of files) {
                    try {
                        const meta = await fileService.getMetadata(file);
                        songs.push(meta);
                    } catch (e) { }
                }

                if (songs.length === 0) return;

                // 2. Set Playlist
                setPlaylist(songs);

                // 3. Turn OFF Shuffle (Folders usually play in order)
                setShuffleState(false);
                toggleShuffleList(false);

                // 4. Play First Song
                setCurrentSongIndex(0);
                const firstSong = songs[0];
                if (firstSong.path) {
                    setMetadata(firstSong);
                    await audioService.play(firstSong.path, firstSong);
                    setIsPlaying(true);
                }

                // 5. Update Recent Timestamp
                addToRecent({
                    ...item,
                    lastPlayed: Date.now()
                });

            } catch (e) {
                console.error("Failed to play folder", e);
            }
        } else {
            // Single File
            playSingleFile(item.path);
        }
    };

    // Handle "Open Folder" Button
    const handleOpenFolder = async () => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
                // Fetch songs
                const files = await fileService.readFolder(selected); // Or getSongsInFolder
                const songs: SongMetadata[] = [];
                for (const file of files) {
                    try {
                        const meta = await fileService.getMetadata(file);
                        songs.push(meta);
                    } catch (e) { }
                }

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
                    cover: null,
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
                            />
                        ))}
                    </div>
                )}
            </section>
        </PageContainer>
    );
}