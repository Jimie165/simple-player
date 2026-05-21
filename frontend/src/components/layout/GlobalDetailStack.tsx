import { useMemo, useEffect, useState } from 'react';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { libraryService } from '@/services/libraryService';
import AlbumDetailView from '@/features/library/components/AlbumDetailView';
import ArtistDetailView from '@/features/library/components/ArtistDetailView';
import PlaylistDetail from '@/features/playlists/detail/PlaylistDetail';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type { ArtistData } from '@/features/library/components/ArtistGridView';
import type { SongMetadata } from '@/types';
import type { Playlist, RecentItem } from '@/types';
import { useSelectionStore } from '@/store/useSelectionStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AnimatePresence, motion } from 'framer-motion';
import ScrollArea from '@/components/common/ScrollArea';

export default function GlobalDetailStack() {
    const { overlayStack, push, pop } = useNavigationStore();
    const { addToRecent } = useLibraryStore();
    const { playSong, shufflePlay } = usePlaybackActions();

    // Helper: Play Song Logic
    const buildRecentForSong = (song: SongMetadata): RecentItem => ({
        id: song.path || '',
        type: 'file',
        title: song.title,
        description: song.artist,
        cover: null,
        cover_path: song.cover_path || null,
        path: song.path || '',
        lastPlayed: Date.now(),
        isLibraryItem: true,
        artist: song.artist
    });

    const handlePlaySong = async (song: SongMetadata, index: number, scopeSongs: SongMetadata[] = [], addToHistory = true, options?: { restartIfCurrent?: boolean, disableShuffle?: boolean }, context?: { type: string, name: string, id?: string }) => {
        await playSong({
            song,
            index,
            playlist: scopeSongs,
            options: {
                ...options,
                disableShuffle: true,
                addToRecent: addToHistory,
                recentItem: addToHistory ? buildRecentForSong(song) : undefined
            },
            context
        });
    };

    // Navigation Helpers
    const handleOpenArtistByName = async (name: string) => {
        try {
            // Always fetch full library to ensure we have all songs by this artist
            // independent of the current playlist/queue
            const allSongs = await libraryService.getLibrarySongs();
            const artistSongs = allSongs.filter(s => s.artist === name);

            if (artistSongs.length > 0) {
                const albums = new Set(artistSongs.map(s => s.album));
                const artistData: ArtistData = {
                    name: name,
                    songs: artistSongs,
                    albumCount: albums.size,
                    count: artistSongs.length,
                    cover: artistSongs[0]?.cover_path || null
                };
                useSelectionStore.getState().clearSelection();
                push({ type: 'artist_detail', data: artistData });
            } else {
                console.warn(`GlobalStack: Artist '${name}' not found in library.`);
            }
        } catch (error) {
            console.error('Failed to open artist:', error);
        }
    };


    // Render the stack
    return (
        <AnimatePresence>
            {overlayStack.map((activeView, index) => {
                let key = `${activeView.type}-${index}`;
                if (activeView.type === 'album_detail') key += `-${(activeView.data as AlbumData).name}`;
                if (activeView.type === 'artist_detail') key += `-${(activeView.data as ArtistData).name}`;
                if (activeView.type === 'playlist_detail') key += `-${(activeView.data as Playlist).id}`;

                return (
                    <motion.div
                        key={key}
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="absolute inset-0 bg-surface dark:bg-surface-container-low shadow-xl z-[50]"
                        style={{ zIndex: 50 + index }}
                    >
                        <div data-tauri-drag-region className="absolute top-0 left-0 right-0 h-6 z-[100] bg-transparent" />
                        <ScrollArea className="h-full" topOffset={48}>
                            <ErrorBoundary>
                                {(() => {
                                    switch (activeView.type) {
                                        case 'album_detail':
                                            return (
                                                <AlbumOverlay
                                                    data={activeView.data as AlbumData}
                                                    onPlaySong={handlePlaySong}
                                                    onShuffle={shufflePlay}
                                                    addToRecent={addToRecent}
                                                    onOpenArtistByName={handleOpenArtistByName}
                                                />
                                            );
                                        case 'artist_detail':
                                            return (
                                                <ArtistOverlay
                                                    data={activeView.data as ArtistData}
                                                    onPlaySong={handlePlaySong}
                                                    onShuffle={shufflePlay}
                                                    addToRecent={addToRecent}
                                                    push={push}
                                                    onOpenArtistByName={handleOpenArtistByName}
                                                />
                                            );
                                        case 'playlist_detail': {
                                            const plData = activeView.data as { id: number | 'favorites', name: string };
                                            return (
                                                <div className="h-full">
                                                    <PlaylistDetail id={plData.id} name={plData.name} onClose={() => pop()} />
                                                </div>
                                            );
                                        }
                                        default:
                                            return null;
                                    }
                                })()}
                            </ErrorBoundary>
                        </ScrollArea>
                    </motion.div>
                );
            })}
        </AnimatePresence>
    );
}

// --- Internal Sub-Components to Isolate Hooks ---

interface OverlayProps {
    data: AlbumData | ArtistData;
    onPlaySong: (song: SongMetadata, index: number, scopeSongs: SongMetadata[], addToHistory?: boolean, options?: { restartIfCurrent?: boolean, disableShuffle?: boolean }, context?: { type: string, name: string, id?: string }) => void;
    onShuffle: (params: { songs: SongMetadata[], context?: { type: string, name: string, id?: string } }) => void;
    addToRecent: (item: RecentItem) => void;
    push?: (view: { type: 'album_detail'; data: AlbumData }) => void;
    onOpenArtistByName: (name: string) => void;
}

function AlbumOverlay({ data: initialData, onPlaySong, onShuffle, addToRecent, onOpenArtistByName }: OverlayProps) {
    const albumInitialData = initialData as AlbumData;
    const [albumData, setAlbumData] = useState<AlbumData>(albumInitialData);

    useEffect(() => {
        // If we have an album name but no songs (or very few, implying incomplete data from a single item context)
        // we should fetch the full album.
        const fetchAlbumSongs = async () => {
            const songs = albumInitialData.songs || [];
            if (songs.length === 0 || (songs.length === 1 && !songs[0].id)) {
                try {
                    const allSongs = await libraryService.getLibrarySongs();
                    const albumSongs = allSongs.filter(s => s.album === albumInitialData.name && (!albumInitialData.artist || s.artist === albumInitialData.artist));
                    if (albumSongs.length > 0) {
                        setAlbumData({
                            ...albumInitialData,
                            songs: albumSongs,
                            cover: albumSongs[0].cover_path || albumInitialData.cover_path || null,
                            cover_path: albumSongs[0].cover_path || albumInitialData.cover_path || null,
                            artist: albumSongs[0].artist || albumInitialData.artist // refine artist if diverse
                        });
                    }
                } catch (e) {
                    console.error("Failed to fetch album songs", e);
                }
            }
        };
        fetchAlbumSongs();
    }, [albumInitialData]);

    return (
        <AlbumDetailView
            album={{ ...albumData, songs: albumData.songs || [] }} // Ensure songs is never undefined
            onPlay={(song, idx, options) => onPlaySong(song, idx, albumData.songs || [], true, { ...options, disableShuffle: true }, { type: 'album_detail', name: albumData.name, id: albumData.name })}
            onPlayAll={() => {
                const songs = albumData.songs || [];
                addToRecent({
                    id: `album:${albumData.name}:${albumData.artist}`,
                    type: 'album',
                    title: albumData.name,
                    artist: albumData.artist,
                    description: `${songs.length} 首歌曲`,
                    cover: null,
                    cover_path: albumData.cover_path || null,
                    path: songs[0]?.path || '',
                    lastPlayed: Date.now(),
                    isLibraryItem: true
                });
                if (songs.length > 0) onPlaySong(songs[0], 0, songs, false, { restartIfCurrent: true, disableShuffle: true }, { type: 'album_detail', name: albumData.name, id: albumData.name });
            }}
            onShuffle={() => {
                const songs = albumData.songs || [];
                if (songs.length > 0) {
                    onShuffle({ songs, context: { type: 'album_detail', name: albumData.name, id: albumData.name } });
                }
            }}
            onOpenAlbumByName={() => { }}
            onOpenArtistByName={onOpenArtistByName}
        />
    );
}

function ArtistOverlay({ data: initialData, onPlaySong, onShuffle, addToRecent, push, onOpenArtistByName }: OverlayProps) {
    const artistInitialData = initialData as ArtistData;
    const [artistData, setArtistData] = useState<ArtistData>(artistInitialData);

    useEffect(() => {
        const fetchArtistSongs = async () => {
            // If songs are empty, fetch from library
            if (!artistInitialData.songs || artistInitialData.songs.length === 0) {
                try {
                    const allSongs = await libraryService.getLibrarySongs();
                    const artistSongs = allSongs.filter(s => s.artist === artistInitialData.name);

                    if (artistSongs.length > 0) {
                        const albums = new Set(artistSongs.map(s => s.album));
                        setArtistData({
                            ...artistInitialData,
                            songs: artistSongs,
                            count: artistSongs.length,
                            albumCount: albums.size,
                            cover: artistSongs[0]?.cover_path || artistInitialData.cover
                        });
                    }
                } catch (e) {
                    console.error("Failed to fetch artist songs", e);
                }
            }
        };
        fetchArtistSongs();
    }, [artistInitialData]);

    // Correct usage of useMemo: It is now at the top level of this component
    const artistAlbums = useMemo(() => {
        const map = new Map<string, AlbumData>();
        (artistData.songs || []).forEach((song: SongMetadata) => {
            const key = (song.album || "Unknown Album") + (song.artist || "Unknown Artist");
            if (!map.has(key)) {
                map.set(key, {
                    name: song.album || "Unknown Album",
                    artist: song.artist || "Unknown Artist",
                    cover: song.cover_path || null,
                    cover_path: song.cover_path || null,
                    songs: []
                });
            }
            map.get(key)!.songs.push(song);
        });
        return Array.from(map.values());
    }, [artistData.songs]);

    const handleOpenAlbum = (album: AlbumData) => {
        useSelectionStore.getState().clearSelection();
        push?.({ type: 'album_detail', data: album });
    };

    const handlePlayAlbum = (album: AlbumData) => {
        const songs = album.songs || [];
        if (songs.length === 0) return;

        addToRecent({
            id: `album:${album.name}:${album.artist}`,
            type: 'album',
            title: album.name,
            artist: album.artist,
            description: `${songs.length} 首歌曲`,
            cover: null,
            cover_path: album.cover_path || null,
            path: songs[0]?.path || '',
            lastPlayed: Date.now(),
            isLibraryItem: true
        });

        onPlaySong(songs[0], 0, songs, false, { restartIfCurrent: true }, { type: 'album_detail', name: album.name, id: album.name });
    };

    const sortedSongs = useMemo(() => {
        return [...(artistData.songs || [])].sort((a, b) => (b.year || 0) - (a.year || 0));
    }, [artistData.songs]);

    return (
        <ArtistDetailView
            artist={artistData}
            albums={artistAlbums}
            onShuffle={() => {
                if (sortedSongs.length > 0) {
                    onShuffle({ songs: sortedSongs, context: { type: 'artist_detail', name: artistData.name, id: artistData.name } });
                }
            }}
            onPlayAlbum={handlePlayAlbum}
            onOpenAlbum={handleOpenAlbum}
            onPlaySong={(song, idx, options) => onPlaySong(song, idx, sortedSongs, true, { ...options, disableShuffle: true }, { type: 'artist_detail', name: artistData.name, id: artistData.name })}
            onOpenArtistByName={onOpenArtistByName}
            onOpenAlbumByName={() => { }}
        />
    );
}
