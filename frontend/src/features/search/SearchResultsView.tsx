import { useState, useEffect, useMemo } from 'react';
import type { SongMetadata } from '@/types';
import type { VideoMetadata } from '@/types/video';
import { libraryService } from '@/services/libraryService';
import PageContainer from '@/components/layout/PageContainer';
import SongListView from '@/features/library/components/SongListView';
import ArtistGridView, { type ArtistData } from '@/features/library/components/ArtistGridView';
import AlbumGridView, { type AlbumData } from '@/features/library/components/AlbumGridView';
import { MdSearch } from 'react-icons/md';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { useNavigationStore } from '@/store/useNavigationStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { audioService } from '@/services/audioService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { formatTime } from '@/utils/time';
import CoverImage from '@/components/common/CoverImage';
import { useMainContentWidth } from '@/hooks/useMainContentWidth';
import { getSparseGridStyle } from '@/utils/gridLayout';

interface SearchResultsViewProps {
    query: string;
}

export default function SearchResultsView({ query }: SearchResultsViewProps) {
    const mainContentWidth = useMainContentWidth();
    const [results, setResults] = useState<SongMetadata[]>([]);
    const [videoResults, setVideoResults] = useState<VideoMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Player controls
    const { playSong } = usePlaybackActions();
    const { push } = useNavigationStore();
    const { setVideoMode, setIsPlaying, setVideoMetadata, setVideoQueue } = usePlayerStore();
    const addToRecent = useLibraryStore(s => s.addToRecent);

    useEffect(() => {
        let isCancelled = false;

        const performSearch = async () => {
            if (!query.trim()) {
                setResults([]);
                setVideoResults([]);
                setError(null);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const [songs, videos] = await Promise.all([
                    libraryService.search(query),
                    libraryService.searchVideos(query),
                ]);

                if (!isCancelled) {
                    setResults(songs);
                    setVideoResults(videos);
                }
            } catch (err) {
                if (!isCancelled) {
                    console.error("Search failed:", err);
                    setError("搜索失败，请稍后重试");
                }
            } finally {
                if (!isCancelled) {
                    setLoading(false);
                }
            }
        };

        const timer = setTimeout(() => {
            performSearch();
        }, 300);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
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
            // Check Song Match - match against title, artist, or album to be inclusive
            const matchTitle = song.title && song.title.toLowerCase().includes(lowerQuery);
            const matchArtist = song.artist && song.artist.toLowerCase().includes(lowerQuery);
            const matchAlbum = song.album && song.album.toLowerCase().includes(lowerQuery);

            if (matchTitle || matchArtist || matchAlbum) {
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
                    cover: songs.find(s => s.cover_path)?.cover_path || null,
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
                    cover: songs.find(s => s.cover_path)?.cover_path || null,
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

    const handlePlayVideo = async (video: VideoMetadata) => {
        const queue = videoResults.map((v) => ({
            id: v.id,
            title: v.title,
            artist: "视频",
            album: v.folder_id ? "文件夹" : "未知",
            duration: v.duration,
            path: v.path,
            cover_path: v.thumbnail_path,
        }));
        let index = videoResults.findIndex(v => v.id === video.id);
        if (index < 0) index = 0;

        setVideoQueue(queue, index);
        setVideoMetadata(queue[index]);
        setVideoMode(true);

        if (usePlayerStore.getState().isPlaying) {
            await audioService.pause();
            setIsPlaying(false);
        }

        addToRecent({
            id: video.path,
            type: 'video',
            title: video.title,
            description: formatTime(video.duration),
            cover: null,
            cover_path: video.thumbnail_path,
            path: video.path,
            lastPlayed: Date.now(),
            artist: "视频",
            album: video.folder_id ? "文件夹" : undefined,
            isLibraryItem: true
        });
    };

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
                    cover: null,
                    cover_path: song.cover_path || null,
                    path: song.path || '',
                    lastPlayed: Date.now(),
                    artist: song.artist
                }
            }
        });
    };

    const hasAnyResults = matchingArtists.length > 0 || matchingAlbums.length > 0 || matchingSongs.length > 0 || videoResults.length > 0;

    return (
        <PageContainer title={`搜索: "${query}"`}>
            {loading ? (
                <div className="flex h-64 items-center justify-center text-neutral-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-500"></div>
                </div>
            ) : error ? (
                <div className="flex flex-col h-64 items-center justify-center text-red-500">
                    <p className="text-lg font-medium">{error}</p>
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

                    {/* Videos Section */}
                    {videoResults.length > 0 && (
                        <section>
                            <h2 className="text-xl font-bold mb-2 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                                视频
                                <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                                    {videoResults.length}
                                </span>
                            </h2>
                            <div
                                className="grid content-grid-video gap-4"
                                style={getSparseGridStyle(mainContentWidth, videoResults.length, 16, 'video')}
                            >
                                {videoResults.map((video) => (
                                    <div
                                        key={video.id}
                                        onClick={() => handlePlayVideo(video)}
                                        className="group relative flex flex-col gap-2 p-2 rounded-xl transition-all cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                                    >
                                        <div className="aspect-video bg-surface-container-highest rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-all relative">
                                            <CoverImage
                                                song={{
                                                    id: video.id,
                                                    title: video.title,
                                                    artist: "视频",
                                                    album: video.folder_id ? "文件夹" : "未知",
                                                    duration: video.duration,
                                                    path: video.path,
                                                    cover_path: video.thumbnail_path,
                                                }}
                                                src={video.thumbnail_path}
                                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            />
                                            {video.duration > 0 && (
                                                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] text-white font-medium z-10">
                                                    {formatTime(video.duration)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-0.5 px-1 text-center">
                                            <h3 className="font-medium truncate text-sm" title={video.title}>{video.title}</h3>
                                            <p className="text-xs opacity-60 truncate">
                                                {formatTime(video.duration)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            ) : (
                <div className="flex flex-col h-full items-center justify-center text-neutral-400 pb-20">
                    <MdSearch className="text-6xl mb-4 opacity-20" />
                    <p className="text-lg font-medium">没有找到相关结果</p>
                    <p className="text-sm opacity-60 mt-1">尝试搜索歌曲、艺人、专辑或视频名称</p>
                </div>
            )}
        </PageContainer>
    );
}
