import { useMemo, useEffect, useRef, useState } from 'react';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { libraryService } from '@/services/libraryService';
import AlbumDetailView from '@/features/library/components/AlbumDetailView';
import ArtistDetailView from '@/features/library/components/ArtistDetailView';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type { ArtistData } from '@/features/library/components/ArtistGridView';
import type { SongMetadata } from '@/types';
import type { RecentItem } from '@/types';
import { useSelectionStore } from '@/store/useSelectionStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import ScrollArea from '@/components/common/ScrollArea';
import { buildAlbums, getAlbumDisplayArtist, songMatchesAlbum } from '@/features/library/utils/grouping';
import { getAlbumMusicItemId } from '@/utils/musicItemUtils';

type OverlayTransitionDirection = 'push' | 'pop' | 'idle';

const overlayTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };
const overlayVariants: Variants = {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: (direction: OverlayTransitionDirection) => direction === 'pop'
        ? { x: '100%', transition: overlayTransition }
        : { x: 0, transition: { duration: 0 } },
};

export default function GlobalDetailStack() {
    const { overlayStack, push } = useNavigationStore();
    const { addToRecent } = useLibraryStore();
    const { playSong, shufflePlay } = usePlaybackActions();
    const [settledOverlayDepth, setSettledOverlayDepth] = useState(overlayStack.length);

    const transitionDirection: OverlayTransitionDirection = overlayStack.length > settledOverlayDepth
        ? 'push'
        : overlayStack.length < settledOverlayDepth
            ? 'pop'
            : 'idle';
    // Keep the immediately covered detail mounted so back navigation restores its
    // data and scroll position. Older detail layers can still be unmounted.
    const visibleOverlayCount = 2;
    const firstVisibleOverlayIndex = Math.max(0, overlayStack.length - visibleOverlayCount);
    const visibleOverlays = overlayStack.slice(firstVisibleOverlayIndex);

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
        <AnimatePresence
            custom={transitionDirection}
            onExitComplete={() => {
                if (overlayStack.length < settledOverlayDepth) {
                    setSettledOverlayDepth(overlayStack.length);
                }
            }}
        >
            {visibleOverlays.map((activeView, visibleIndex) => {
                const index = firstVisibleOverlayIndex + visibleIndex;
                const isTopOverlay = index === overlayStack.length - 1;
                const isFrozenOverlay = !isTopOverlay && transitionDirection !== 'push';
                let key = `${activeView.type}-${index}`;
                if (activeView.type === 'album_detail') key += `-${(activeView.data as AlbumData).name}`;
                if (activeView.type === 'artist_detail') key += `-${(activeView.data as ArtistData).name}`;

                return (
                    <motion.div
                        key={key}
                        custom={transitionDirection}
                        variants={overlayVariants}
                        initial={transitionDirection === 'pop' ? false : 'initial'}
                        animate="animate"
                        exit="exit"
                        transition={overlayTransition}
                        onAnimationComplete={() => {
                            if (isTopOverlay && transitionDirection === 'push') {
                                setSettledOverlayDepth(overlayStack.length);
                            }
                        }}
                        className="absolute inset-0 bg-surface dark:bg-surface-container-low shadow-xl z-50"
                        style={{
                            zIndex: 50 + index,
                            ...(isFrozenOverlay ? { contentVisibility: 'hidden', contain: 'strict' } : {}),
                        }}
                        inert={!isTopOverlay}
                        aria-hidden={!isTopOverlay}
                    >
                        <div data-tauri-drag-region className="absolute top-0 left-0 right-0 h-6 z-100 bg-transparent" />
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
    const libraryVersion = useLibraryStore(state => state.libraryVersion);
    const pop = useNavigationStore(state => state.pop);
    const resolvedSongIdsRef = useRef<Set<number> | null>(null);
    const albumInitialData = useMemo<AlbumData>(() => {
        const data = initialData as Partial<AlbumData>;
        return {
            name: data.name ?? '',
            artist: data.artist ?? '',
            cover: data.cover ?? data.cover_path ?? null,
            cover_path: data.cover_path ?? data.cover ?? null,
            songs: Array.isArray(data.songs) ? data.songs : [],
        };
    }, [initialData]);
    const [albumData, setAlbumData] = useState<AlbumData>(albumInitialData);

    useEffect(() => {
        // Always resolve the complete album from the library. An album opened
        // from an artist page may initially contain only that artist's tracks.
        const fetchAlbumSongs = async () => {
            if (albumInitialData.name) {
                try {
                    const allSongs = await libraryService.getLibrarySongs();
                    const resolvedIds = resolvedSongIdsRef.current;
                    const albumSongs = resolvedIds
                        ? allSongs.filter(song => typeof song.id === 'number' && resolvedIds.has(song.id))
                        : allSongs.filter(song => songMatchesAlbum(song, albumInitialData.name, albumInitialData.artist));
                    if (albumSongs.length > 0) {
                        resolvedSongIdsRef.current = new Set(
                            albumSongs.flatMap(song => typeof song.id === 'number' ? [song.id] : [])
                        );
                        const firstSong = albumSongs[0];
                        const coverPath = albumSongs.find(song => song.cover_path)?.cover_path ?? null;
                        setAlbumData({
                            ...albumInitialData,
                            name: firstSong.album?.trim() || 'Unknown Album',
                            songs: albumSongs,
                            cover: coverPath,
                            cover_path: coverPath,
                            artist: getAlbumDisplayArtist(albumSongs)
                        });
                    }
                } catch (e) {
                    console.error("Failed to fetch album songs", e);
                }
            }
        };
        fetchAlbumSongs();
    }, [albumInitialData, libraryVersion]);

    return (
        <AlbumDetailView
            album={{ ...albumData, songs: albumData.songs || [] }} // Ensure songs is never undefined
            onPlay={(song, idx, options) => onPlaySong(song, idx, albumData.songs || [], true, { ...options, disableShuffle: true }, { type: 'album_detail', name: albumData.name, id: albumData.name })}
            onPlayAll={() => {
                const songs = albumData.songs || [];
                addToRecent({
                    id: getAlbumMusicItemId(albumData.name, albumData.artist),
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
            onAlbumDeleted={pop}
        />
    );
}

function ArtistOverlay({ data: initialData, onPlaySong, onShuffle, addToRecent, push, onOpenArtistByName }: OverlayProps) {
    const libraryVersion = useLibraryStore(state => state.libraryVersion);
    const artistInitialData = useMemo<ArtistData>(() => {
        const data = initialData as Partial<ArtistData>;
        return {
            name: data.name ?? '',
            cover: data.cover ?? null,
            count: data.count ?? 0,
            albumCount: data.albumCount ?? 0,
            songs: Array.isArray(data.songs) ? data.songs : [],
            includeAlbumArtistSongs: data.includeAlbumArtistSongs ?? false,
        };
    }, [initialData]);
    const [artistData, setArtistData] = useState<ArtistData>(artistInitialData);

    useEffect(() => {
        const fetchArtistSongs = async () => {
            try {
                const allSongs = await libraryService.getLibrarySongs();
                const artistSongs = allSongs.filter(song => (
                    song.artist === artistInitialData.name
                    || (
                        artistInitialData.includeAlbumArtistSongs
                        && song.album_artist?.trim() === artistInitialData.name
                    )
                ));
                const albums = new Set(artistSongs.map(s => s.album));
                setArtistData({
                    ...artistInitialData,
                    songs: artistSongs,
                    count: artistSongs.length,
                    albumCount: albums.size,
                    cover: artistSongs[0]?.cover_path || null
                });
            } catch (e) {
                console.error("Failed to fetch artist songs", e);
            }
        };
        fetchArtistSongs();
    }, [artistInitialData, libraryVersion]);

    // Correct usage of useMemo: It is now at the top level of this component
    const artistAlbums = useMemo(() => {
        return buildAlbums(artistData.songs || [], 'name');
    }, [artistData.songs]);

    const handleOpenAlbum = (album: AlbumData) => {
        useSelectionStore.getState().clearSelection();
        push?.({ type: 'album_detail', data: album });
    };

    const handlePlayAlbum = (album: AlbumData) => {
        const songs = album.songs || [];
        if (songs.length === 0) return;

        addToRecent({
            id: getAlbumMusicItemId(album.name, album.artist),
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
