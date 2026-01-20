import { useMemo } from 'react';
import { useNavigationStore } from '../../store/useNavigationStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { audioService } from '../../services/audioService';
import AlbumDetailView from '../../features/library/components/AlbumDetailView';
import ArtistDetailView from '../../features/library/components/ArtistDetailView';
import PlaylistDetail from '../../features/playlists/components/PlaylistDetail';
import type { AlbumData } from '../../features/library/components/AlbumGridView';
import type { ArtistData } from '../../features/library/components/ArtistGridView';
import type { SongMetadata } from '../../types';

export default function GlobalDetailStack() {
    const { overlayStack, push } = useNavigationStore();
    const { setPlaylist, setCurrentSongIndex, addToRecent, toggleShuffleList, originalPlaylist, playlist } = useLibraryStore();
    const { setMetadata, setIsPlaying, setShuffleState } = usePlayerStore();

    // Helper: Play Song Logic
    const handlePlaySong = async (song: SongMetadata, index: number, scopeSongs: SongMetadata[] = [], addToHistory = true) => {
        if (!song.path) return;

        await audioService.play(song.path, song);
        setMetadata(song);
        setIsPlaying(true);

        if (scopeSongs.length > 0) {
            setPlaylist(scopeSongs);
            if (usePlayerStore.getState().isShuffling) {
                setCurrentSongIndex(index);
                toggleShuffleList(true);
            } else {
                setCurrentSongIndex(index);
            }
        }

        if (addToHistory) {
            addToRecent({
                id: song.path,
                type: 'file',
                title: song.title,
                description: song.artist,
                cover: song.cover,
                cover_path: song.cover_path || null,
                path: song.path,
                lastPlayed: Date.now(),
                isLibraryItem: true,
                artist: song.artist
            });
        }
    };

    // Navigation Helpers
    const handleOpenArtistByName = (name: string) => {
        const source = originalPlaylist.length > 0 ? originalPlaylist : playlist;
        const artistSongs = source.filter(s => s.artist === name);

        if (artistSongs.length > 0) {
            const albums = new Set(artistSongs.map(s => s.album));
            const artistData: ArtistData = {
                name: name,
                songs: artistSongs,
                albumCount: albums.size,
                count: artistSongs.length,
                cover: artistSongs[0]?.cover || null
            };
            push({ type: 'artist_detail', data: artistData });
        } else {
            console.warn(`GlobalStack: Artist '${name}' not found.`);
        }
    };

    // Render the stack
    if (overlayStack.length === 0) return null;

    const activeView = overlayStack[overlayStack.length - 1];
    const overlayClass = "absolute inset-0 z-50 bg-surface dark:bg-surface-container-low transition-transform duration-300 ease-out transform translate-y-0 overflow-y-auto";

    return (
        <div className={overlayClass}>
            <div data-tauri-drag-region className="h-6 w-full shrink-0 bg-transparent" />
            {(() => {
                switch (activeView.type) {
                    case 'album_detail':
                        return (
                            <AlbumOverlay
                                data={activeView.data as AlbumData}
                                onPlaySong={handlePlaySong}
                                addToRecent={addToRecent}
                                setPlaylist={setPlaylist}
                                setCurrentSongIndex={setCurrentSongIndex}
                                toggleShuffleList={toggleShuffleList}
                                setShuffleState={setShuffleState}
                                onOpenArtistByName={handleOpenArtistByName}
                            />
                        );
                    case 'artist_detail':
                        return (
                            <ArtistOverlay
                                data={activeView.data as ArtistData}
                                onPlaySong={handlePlaySong}
                                addToRecent={addToRecent}
                                setPlaylist={setPlaylist}
                                setCurrentSongIndex={setCurrentSongIndex}
                                toggleShuffleList={toggleShuffleList}
                                setShuffleState={setShuffleState}
                                push={push}
                                onOpenArtistByName={handleOpenArtistByName}
                            />
                        );
                    case 'playlist_detail':
                        const plData = activeView.data as { id: number | 'favorites', name: string };
                        return (
                            <div className="h-full bg-surface dark:bg-surface-container-low">
                                <PlaylistDetail id={plData.id} name={plData.name} />
                            </div>
                        );
                    default:
                        return null;
                }
            })()}
        </div>
    );
}

// --- Internal Sub-Components to Isolate Hooks ---

interface OverlayProps {
    data: any;
    onPlaySong: (song: SongMetadata, index: number, scopeSongs: SongMetadata[], addToHistory?: boolean) => void;
    addToRecent: (item: any) => void;
    setPlaylist: (songs: SongMetadata[]) => void;
    setCurrentSongIndex: (index: number) => void;
    toggleShuffleList: (enable: boolean) => void;
    setShuffleState: (state: boolean) => void;
    push?: (view: any) => void;
    onOpenArtistByName: (name: string) => void;
}

function AlbumOverlay({ data: albumData, onPlaySong, addToRecent, setPlaylist, setCurrentSongIndex, toggleShuffleList, setShuffleState, onOpenArtistByName }: OverlayProps) {
    return (
        <AlbumDetailView
            album={albumData}
            onPlay={(song, idx) => onPlaySong(song, idx, albumData.songs)}
            onPlayAll={() => {
                addToRecent({
                    id: `album:${albumData.name}:${albumData.artist}`,
                    type: 'album',
                    title: albumData.name,
                    artist: albumData.artist,
                    description: `${albumData.songs.length} 首歌曲`,
                    cover: albumData.cover,
                    cover_path: albumData.cover_path || null,
                    path: albumData.songs[0]?.path || '',
                    lastPlayed: Date.now(),
                    isLibraryItem: true
                });
                if (albumData.songs.length > 0) onPlaySong(albumData.songs[0], 0, albumData.songs, false);
            }}
            onShuffle={() => {
                if (albumData.songs.length > 0) {
                    const randomIndex = Math.floor(Math.random() * albumData.songs.length);
                    setPlaylist(albumData.songs);
                    setCurrentSongIndex(randomIndex);
                    toggleShuffleList(true);
                    setShuffleState(true);
                    onPlaySong(albumData.songs[randomIndex], 0, [], false);
                }
            }}
            onDeleteSong={() => { }} // TODO: Global Delete
            onOpenAlbumByName={() => { }}
            onOpenArtistByName={onOpenArtistByName}
        />
    );
}

function ArtistOverlay({ data: artistData, onPlaySong, addToRecent, setPlaylist, setCurrentSongIndex, toggleShuffleList, setShuffleState, push, onOpenArtistByName }: OverlayProps) {
    // Correct usage of useMemo: It is now at the top level of this component
    const artistAlbums = useMemo(() => {
        const map = new Map<string, AlbumData>();
        artistData.songs.forEach((song: SongMetadata) => {
            const key = (song.album || "Unknown Album") + (song.artist || "Unknown Artist");
            if (!map.has(key)) {
                map.set(key, {
                    name: song.album || "Unknown Album",
                    artist: song.artist || "Unknown Artist",
                    cover: song.cover || null,
                    cover_path: song.cover_path || null,
                    songs: []
                });
            }
            map.get(key)!.songs.push(song);
        });
        return Array.from(map.values());
    }, [artistData.songs]);

    const handleOpenAlbum = (album: AlbumData) => {
        push?.({ type: 'album_detail', data: album });
    };

    return (
        <ArtistDetailView
            artist={artistData}
            albums={artistAlbums}
            allArtistSongs={artistData.songs}
            onPlayAll={() => {
                addToRecent({
                    id: `artist:${artistData.name}`,
                    type: 'album',
                    title: artistData.name,
                    artist: artistData.name,
                    description: `${artistData.songs.length} 首歌曲`,
                    cover: artistData.cover,
                    cover_path: artistData.songs[0]?.cover_path || null,
                    path: artistData.songs[0]?.path || '',
                    lastPlayed: Date.now(),
                    isLibraryItem: true
                });
                if (artistData.songs.length > 0) onPlaySong(artistData.songs[0], 0, artistData.songs, false);
            }}
            onShuffle={() => {
                if (artistData.songs.length > 0) {
                    const randomIndex = Math.floor(Math.random() * artistData.songs.length);
                    setPlaylist(artistData.songs);
                    setCurrentSongIndex(randomIndex);
                    toggleShuffleList(true);
                    setShuffleState(true);
                    onPlaySong(artistData.songs[randomIndex], 0, [], false);
                }
            }}
            onPlayAlbum={handleOpenAlbum}
            onOpenAlbum={handleOpenAlbum}
            onPlaySong={(song, idx) => onPlaySong(song, idx, artistData.songs)}
            onDeleteSong={() => { }}
            onDeleteAlbum={() => { }}
            onOpenArtistByName={onOpenArtistByName}
            onOpenAlbumByName={() => { }}
        />
    );
}
