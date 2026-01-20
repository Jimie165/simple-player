import { useState, useEffect } from 'react';
import { MdPlayArrow, MdShuffle } from 'react-icons/md';
import PageContainer from '../../../components/layout/PageContainer';
import SongListView from '../../library/components/SongListView';

import { libraryService } from '../../../services/libraryService';
import { usePlayerStore } from '../../../store/usePlayerStore';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { audioService } from '../../../services/audioService';
import type { SongMetadata } from '../../../types';

interface PlaylistDetailProps {
    id: number | 'favorites';
    name: string;
}

export default function PlaylistDetail({ id, name }: PlaylistDetailProps) {
    const [songs, setSongs] = useState<SongMetadata[]>([]);
    const [loading, setLoading] = useState(false);


    const { setMetadata, setIsPlaying, setShuffleState } = usePlayerStore();
    const { setPlaylist, setCurrentSongIndex, addToRecent, toggleShuffleList } = useLibraryStore();

    const loadSongs = async () => {
        setLoading(true);
        try {
            let list: SongMetadata[] = [];
            if (id === 'favorites') {
                list = await libraryService.getFavorites();
            } else {
                list = await libraryService.getPlaylistSongs(id);
            }
            setSongs(list);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadSongs(); }, [id]);

    const handlePlaySong = async (song: SongMetadata, index: number) => {
        if (!song.path) return;
        await audioService.play(song.path, song);
        setMetadata(song);
        setIsPlaying(true);
        setPlaylist(songs);

        // Check if shuffle is active from the store
        // Note: access external store state directly or via hook props if available
        if (usePlayerStore.getState().isShuffling) {
            setCurrentSongIndex(index);
            toggleShuffleList(true);
        } else {
            setCurrentSongIndex(index);
        }

        addToRecent({
            id: song.path,
            type: 'file',
            title: song.title,
            description: song.artist,
            cover: song.cover,
            path: song.path,
            lastPlayed: Date.now(),
            artist: song.artist
        });
    };

    const handlePlayAll = () => {
        if (songs.length > 0) {
            handlePlaySong(songs[0], 0);
        }
    };

    const handleShuffle = async () => {
        if (songs.length > 0) {
            const randomIndex = Math.floor(Math.random() * songs.length);
            const song = songs[randomIndex];

            // 1. Setup Shuffle State
            setPlaylist(songs);
            setCurrentSongIndex(randomIndex);
            toggleShuffleList(true); // Shuffles and sets index to 0
            setShuffleState(true);

            // 2. Play
            if (!song.path) return;
            await audioService.play(song.path, song);
            setMetadata(song);
            setIsPlaying(true);

            // 3. Add to Recent
            addToRecent({
                id: song.path,
                type: 'file',
                title: song.title,
                description: song.artist,
                cover: song.cover,
                path: song.path,
                lastPlayed: Date.now(),
                artist: song.artist
            });
        }
    };

    return (
        <PageContainer
            title={name}
            actions={
                <div className="flex gap-2">
                    <button
                        onClick={handlePlayAll}
                        className="p-2 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors active:scale-95"
                        title="全部播放"
                    >
                        <MdPlayArrow className="text-xl" />
                    </button>
                    <button
                        onClick={handleShuffle}
                        className="p-2 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors active:scale-95"
                        title="随机播放"
                    >
                        <MdShuffle className="text-xl" />
                    </button>
                </div>
            }
        >


            {loading ? (
                <div className="flex h-64 items-center justify-center text-neutral-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-500"></div>
                </div>
            ) : (
                <div className="pb-8">
                    <SongListView
                        songs={songs}
                        onPlay={handlePlaySong}
                        enableDelete={false}
                    />
                </div>
            )}
        </PageContainer>
    );
}
