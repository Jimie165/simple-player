import { useState, useEffect, useMemo } from 'react';
import type { SongMetadata } from '../../types';
import { libraryService } from '../../services/libraryService';
import PageContainer from '../../components/layout/PageContainer';
import SongListView from '../library/components/SongListView';
import ArtistGridView, { type ArtistData } from '../library/components/ArtistGridView';
import AlbumGridView, { type AlbumData } from '../library/components/AlbumGridView';
import { MdSearch } from 'react-icons/md';
import { usePlaybackActions } from '../../hooks/usePlaybackActions';
import { useNavigationStore } from '../../store/useNavigationStore';

interface SearchResultsViewProps {
    query: string;
}

export default function SearchResultsView({ query }: SearchResultsViewProps) {
    const [results, setResults] = useState<SongMetadata[]>([]);
    const [loading, setLoading] = useState(false);

    // Player controls
    const { playSong } = usePlaybackActions();
    const { push } = useNavigationStore();

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

    // Categorize Results
    const { matchingArtists, matchingAlbums, matchingSongs } = useMemo(() => {
        const lowerQuery = query.toLowerCase();

        // 1. Group all songs by Artist and Album first to construct full objects
        // We only care about Artists/Albums that MATCH the query.
        // However, a Song might match the query but its Artist doesn't.
        // In WMP logic, usually:
        // - Artists section: Artists whose name matches
        // - Albums section: Albums whose name matches
        // - Songs section: Songs whose title matches

        const artistMap = new Map<string, SongMetadata[]>();
        const albumMap = new Map<string, SongMetadata[]>();
        const matchedSongs: SongMetadata[] = [];

        results.forEach(song => {
            // Check Song Match
            if (song.title && song.title.toLowerCase().includes(lowerQuery)) {
                matchedSongs.push(song);
            }

            // Group for Artist check
            if (song.artist) {
                const artistKey = song.artist;
                if (!artistMap.has(artistKey)) artistMap.set(artistKey, []);
                artistMap.get(artistKey)?.push(song);
            }

            // Group for Album check
            if (song.album) {
                const albumKey = `${song.album}||${song.artist || ''}`; // composite key
                if (!albumMap.has(albumKey)) albumMap.set(albumKey, []);
                albumMap.get(albumKey)?.push(song);
            }
        });

        // Filter Artists
        const finalArtists: ArtistData[] = [];
        for (const [name, songs] of artistMap.entries()) {
            if (name.toLowerCase().includes(lowerQuery)) {
                // Construct ArtistData
                // Find distinct albums
                const albums = new Set(songs.map(s => s.album).filter(Boolean));
                finalArtists.push({
                    name,
                    cover: songs.find(s => s.cover)?.cover || null,
                    count: songs.length,
                    albumCount: albums.size,
                    songs
                });
            }
        }

        // Filter Albums
        const finalAlbums: AlbumData[] = [];
        for (const [key, songs] of albumMap.entries()) {
            const [albumName, artistName] = key.split('||');
            if (albumName.toLowerCase().includes(lowerQuery)) {
                finalAlbums.push({
                    name: albumName,
                    artist: artistName,
                    cover: songs.find(s => s.cover)?.cover || null,
                    cover_path: songs.find(s => s.cover_path)?.cover_path || null,
                    songs
                });
            }
        }

        return {
            matchingArtists: finalArtists,
            matchingAlbums: finalAlbums,
            matchingSongs: matchedSongs
        };
    }, [results, query]);

    const handlePlay = async (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => {
        await playSong({
            song,
            index,
            playlist: matchingSongs, // Use only matched songs playlist
            options: {
                ...options,
                recentItem: {
                    id: song.path || '',
                    type: 'file',
                    title: song.title,
                    description: song.artist,
                    cover: song.cover || null,
                    path: song.path || '',
                    lastPlayed: Date.now(),
                    artist: song.artist
                }
            }
        });
    };

    const hasAnyResults = matchingArtists.length > 0 || matchingAlbums.length > 0 || matchingSongs.length > 0;

    return (
        <PageContainer title={`搜索: "${query}"`}>
            {loading ? (
                <div className="flex h-64 items-center justify-center text-neutral-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-500"></div>
                </div>
            ) : hasAnyResults ? (
                <div className="pb-8 flex flex-col gap-8">
                    {/* Artists Section */}
                    {matchingArtists.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                                艺人
                                <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                                    {matchingArtists.length}
                                </span>
                            </h2>
                            <ArtistGridView
                                artists={matchingArtists}
                                onPlayArtist={(artist) => {
                                    if (artist.songs.length > 0) {
                                        // Reuse logic or import util? Just basic play for now
                                        playSong({ song: artist.songs[0], index: 0, playlist: artist.songs });
                                    }
                                }}
                                onOpenArtist={(artist) => push({ type: 'artist_detail', data: artist })}
                            />
                        </section>
                    )}

                    {/* Albums Section */}
                    {matchingAlbums.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-4 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                                专辑
                                <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                                    {matchingAlbums.length}
                                </span>
                            </h2>
                            <AlbumGridView
                                albums={matchingAlbums}
                                onPlayAlbum={(album) => {
                                    if (album.songs.length > 0) {
                                        playSong({ song: album.songs[0], index: 0, playlist: album.songs });
                                    }
                                }}
                                onOpenAlbum={(album) => push({ type: 'album_detail', data: album })}
                                onOpenArtist={(artistName) => push({ type: 'artist_detail', data: { name: artistName, songs: [], count: 0, albumCount: 0, cover: null } })}
                            />
                        </section>
                    )}

                    {/* Songs Section */}
                    {matchingSongs.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-2 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                                歌曲
                                <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                                    {matchingSongs.length}
                                </span>
                            </h2>
                            <SongListView
                                songs={matchingSongs}
                                onPlay={handlePlay}
                            />
                        </section>
                    )}
                </div>
            ) : (
                <div className="flex flex-col h-full items-center justify-center text-neutral-400 pb-20">
                    <MdSearch className="text-6xl mb-4 opacity-20" />
                    <p className="text-lg font-medium">没有找到相关结果</p>
                    <p className="text-sm opacity-60 mt-1">尝试搜索歌曲、艺人或专辑名称</p>
                </div>
            )}
        </PageContainer>
    );
}
