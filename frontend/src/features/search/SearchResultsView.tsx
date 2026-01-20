import { useState, useEffect } from 'react';
import type { SongMetadata } from '../../types';
import { libraryService } from '../../services/libraryService';
import PageContainer from '../../components/layout/PageContainer';
import SongListView from '../library/components/SongListView';
import { IoSearch } from 'react-icons/io5';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { audioService } from '../../services/audioService';

interface SearchResultsViewProps {
    query: string;
}

export default function SearchResultsView({ query }: SearchResultsViewProps) {
    const [results, setResults] = useState<SongMetadata[]>([]);
    const [loading, setLoading] = useState(false);

    // Player controls
    const setMetadata = usePlayerStore((s) => s.setMetadata);
    const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
    const { setPlaylist, setCurrentSongIndex, addToRecent } = useLibraryStore();

    useEffect(() => {
        const performSearch = async () => {
            if (!query.trim()) {
                setResults([]);
                return;
            }

            setLoading(true);
            try {
                const songs = await libraryService.search(query);
                setResults(songs);
            } catch (error) {
                console.error("Search failed:", error);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(() => {
            performSearch();
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const handlePlay = async (song: SongMetadata, index: number) => {
        if (!song.path) return;
        await audioService.play(song.path, song);
        setMetadata(song);
        setIsPlaying(true);

        setPlaylist(results);
        setCurrentSongIndex(index);
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

    return (
        <PageContainer title={`搜索: "${query}"`}>
            {loading ? (
                <div className="flex h-64 items-center justify-center text-neutral-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-500"></div>
                </div>
            ) : results.length > 0 ? (
                <div className="pb-8">
                    <SongListView
                        songs={results}
                        onPlay={handlePlay}
                    />
                </div>
            ) : (
                <div className="flex flex-col h-full items-center justify-center text-neutral-400 pb-20">
                    <IoSearch className="text-6xl mb-4 opacity-20" />
                    <p className="text-lg font-medium">没有找到相关结果</p>
                    <p className="text-sm opacity-60 mt-1">尝试搜索歌曲、艺人或专辑名称</p>
                </div>
            )}
        </PageContainer>
    );
}
