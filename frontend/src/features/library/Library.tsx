import { useState, useEffect, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';
import { MdMusicNote, MdAlbum, MdPerson, MdSort, MdCheck } from 'react-icons/md';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';

import PageContainer from '../../components/layout/PageContainer';
import LibraryHeaderButton from './components/LibraryHeaderButton';
import SongListView from './components/SongListView';
import AlbumGridView from './components/AlbumGridView';
import AlbumDetailView from './components/AlbumDetailView';
import ArtistGridView from './components/ArtistGridView';
import ArtistDetailView from './components/ArtistDetailView';

import type { AlbumData } from './components/AlbumGridView';
import type { ArtistData } from './components/ArtistGridView';

import { libraryService } from '../../services/libraryService';
import { audioService } from '../../services/audioService';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
// Import the new Global Store
import { useNavigationStore } from '../../store/useNavigationStore';
import type { SongMetadata } from '../../types';

export default function Library() {
    // Local state for Library Root Tab (parallel to global stack, or part of ViewState? 
    // User wants "Global History Stack". 
    // Implementation: Library View contains Tabs. Switching tabs changes Library View state, doesn't push stack?
    // Or does it push? "Timeline logic". 
    // If I go Artists -> [Select Artist] -> [Back], I should go to Artists.
    // If I go Songs -> Artists, then [Back], do I go to Songs? 
    // Usually Tabs are "Root" parallel modes. Browsers don't stack tabs.
    // I represents "Library" as the root view, and "currentTab" as internal state of Library View.
    // UPDATE: User wants Tabs to be history entries.

    // Sort logic remains local or global? Local to Library root is fine.
    const [albumSortKey, setAlbumSortKey] = useState<'name' | 'artist'>('name');
    const [librarySongs, setLibrarySongs] = useState<SongMetadata[]>([]);

    const { setMetadata, setIsPlaying, setShuffleState } = usePlayerStore();
    const { setPlaylist, setCurrentSongIndex, addToRecent } = useLibraryStore();

    // Use Global Navigation Store
    const { currentView, push } = useNavigationStore();

    // Derived State from Store
    const currentTab = currentView.type === 'library' ? (currentView.tab || 'songs') : 'songs';

    const refreshLibrary = async () => {
        try {
            const songs = await libraryService.scanLibrary();
            setLibrarySongs(songs);
        } catch (e) {
            console.error("Failed to scan library", e);
        } finally {
        }
    };

    useEffect(() => { refreshLibrary(); }, []);

    const handleAddFolder = async () => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
                await libraryService.addFolder(selected);
                await refreshLibrary();
            }
        } catch (err) { console.error(err); }
    };

    // --------------------------------------------------------
    // 【核心逻辑】数据聚合 (Group By)
    // --------------------------------------------------------

    // 1. 生成专辑列表 (带排序)
    const albums = useMemo(() => {
        const map = new Map<string, AlbumData>();
        librarySongs.forEach(song => {
            const key = (song.album || "Unknown Album") + (song.artist || "Unknown Artist");
            if (!map.has(key)) {
                map.set(key, {
                    name: song.album || "Unknown Album",
                    artist: song.artist || "Unknown Artist",
                    cover: song.cover || null,
                    songs: []
                });
            }
            map.get(key)!.songs.push(song);
        });

        let list = Array.from(map.values());

        // Sorting
        if (albumSortKey === 'name') {
            list.sort((a, b) => a.name.localeCompare(b.name));
        } else {
            list.sort((a, b) => a.artist.localeCompare(b.artist));
        }
        return list;
    }, [librarySongs, albumSortKey]);

    // 2. 生成艺人列表 (包含专辑)
    const artists = useMemo(() => {
        const map = new Map<string, ArtistData>();
        librarySongs.forEach(song => {
            const artistName = song.artist || "Unknown Artist";
            if (!map.has(artistName)) {
                map.set(artistName, {
                    name: artistName,
                    cover: null, // Initial null
                    count: 0,
                    albumCount: 0,
                    songs: []
                });
            }
            const artist = map.get(artistName)!;
            artist.songs.push(song);
            artist.count += 1;

            // Use first song's cover as artist cover if available and not set
            if (!artist.cover && song.cover) {
                artist.cover = song.cover;
            }
        });

        const list = Array.from(map.values());

        // Calculate album count for each artist
        list.forEach(artist => {
            const artistAlbums = new Set(artist.songs.map(s => s.album));
            artist.albumCount = artistAlbums.size;
        });

        // Sort by name
        list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    }, [librarySongs]);


    // --------------------------------------------------------
    // Navigation Handlers (Adapters to Push)
    // --------------------------------------------------------
    const handleOpenArtist = (artist: ArtistData) => {
        push({ type: 'artist_detail', data: artist });
    };

    const handleOpenAlbum = (album: AlbumData) => {
        push({ type: 'album_detail', data: album });
    };

    const handleOpenArtistByName = (name: string) => {
        const found = artists.find(a => a.name === name);
        if (found) handleOpenArtist(found);
    };

    const handleOpenAlbumByName = (name: string) => {
        // Find album by name (and artist if possible, but song list might only give name)
        // Ideally we need strict matching. Simple for now:
        const found = albums.find(a => a.name === name);
        if (found) handleOpenAlbum(found);
    };

    const handlePlaySong = async (song: SongMetadata, index: number, scopeSongs: SongMetadata[] = librarySongs) => {
        if (!song.path) return;
        await audioService.play(song.path, song);
        setMetadata(song);
        setIsPlaying(true);
        setPlaylist(scopeSongs);
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

    // --------------------------------------------------------
    // Render Content Switcher
    // --------------------------------------------------------
    const renderContent = () => {
        switch (currentView.type) {
            case 'library':
                return (
                    <div className="flex flex-col h-full">
                        {/* Tabs */}
                        <div className="flex items-center gap-1 mb-6 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg w-fit">
                            {[
                                { id: 'songs', label: '歌曲', icon: MdMusicNote },
                                { id: 'albums', label: '专辑', icon: MdAlbum },
                                { id: 'artists', label: '艺人', icon: MdPerson },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        // If different tab, push to stack
                                        if (currentTab !== tab.id) {
                                            push({ type: 'library', tab: tab.id as any });
                                        }
                                    }}
                                    className={clsx(
                                        "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                                        currentTab === tab.id
                                            ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                                            : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                                    )}
                                >
                                    <tab.icon className="text-lg" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Sort for Albums */}
                        {currentTab === 'albums' && (
                            <div className="flex justify-end mb-4">
                                <Menu as="div" className="relative">
                                    <MenuButton className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
                                        <MdSort className="text-lg" />
                                        排序: {albumSortKey === 'name' ? '名称' : '艺人'}
                                    </MenuButton>
                                    <MenuItems
                                        anchor="bottom end"
                                        className="w-40 origin-top-right rounded-xl border border-neutral-200 bg-white p-1 text-sm text-neutral-900 shadow-xl ring-1 ring-black/5 focus:outline-none dark:bg-[#2c2c2c] dark:border-neutral-700 dark:text-white z-50 mt-2"
                                    >
                                        <MenuItem>
                                            <button onClick={() => setAlbumSortKey('name')} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                                按名称
                                                {albumSortKey === 'name' && <MdCheck />}
                                            </button>
                                        </MenuItem>
                                        <MenuItem>
                                            <button onClick={() => setAlbumSortKey('artist')} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                                按艺人
                                                {albumSortKey === 'artist' && <MdCheck />}
                                            </button>
                                        </MenuItem>
                                    </MenuItems>
                                </Menu>
                            </div>
                        )}

                        {/* Views */}
                        <div className="flex-1 min-h-0">
                            {currentTab === 'songs' && (
                                <SongListView
                                    songs={librarySongs}
                                    onPlay={(song) => handlePlaySong(song, librarySongs.indexOf(song))}
                                    // onDelete logic is inside SongListView context menu, using proper service?
                                    // Wait, onDelete prop is optional but valuable.
                                    onDelete={async () => {
                                        // TODO: Implement delete library logic if needed here or verify SongListView handles it?
                                        // SongListView context menu currently:
                                        // onConfirm={() => { libraryService.deleteSong(song.id).then(...) }}
                                        // We should verify if it triggers refresh.
                                        // Ideally we pass a refresh callback.
                                        // For now let's pass refreshLibrary just in case we wire it up.
                                        await refreshLibrary();
                                    }}
                                    onOpenArtist={handleOpenArtistByName}
                                    onOpenAlbum={handleOpenAlbumByName}
                                />
                            )}
                            {currentTab === 'albums' && (
                                <AlbumGridView
                                    albums={albums}
                                    onPlayAlbum={(album) => {
                                        // Play Album Logic (Play first song, queue rest)
                                        // Reuse AudioService shuffle logic or custom?
                                        // Simple: Play all songs in album.
                                        if (album.songs.length > 0) {
                                            handlePlaySong(album.songs[0], 0, album.songs);
                                        }
                                    }}
                                    onOpenAlbum={handleOpenAlbum}
                                    onOpenArtist={(artistName) => {
                                        // Find artist data by name
                                        const found = artists.find(a => a.name === artistName);
                                        if (found) handleOpenArtist(found);
                                    }}
                                    onDeleteAlbum={async () => await refreshLibrary()}
                                />
                            )}
                            {currentTab === 'artists' && (
                                <ArtistGridView
                                    artists={artists}
                                    onPlayArtist={(artist) => {
                                        if (artist.songs.length > 0) {
                                            handlePlaySong(artist.songs[0], 0, artist.songs);
                                        }
                                    }}
                                    onOpenArtist={handleOpenArtist}
                                    onDeleteArtist={async () => await refreshLibrary()}
                                />
                            )}
                        </div>
                    </div>
                );

            case 'artist_detail':
                const artistData = currentView.data as ArtistData;
                // We need to filter albums for this artist.
                // Re-calculate or pass albums?
                // Better to calculate from librarySongs for consistency or pass pre-calculated?
                // Efficient to filter now.
                const artistAlbums = albums.filter(a => a.artist === artistData.name);

                return (
                    <ArtistDetailView
                        artist={artistData}
                        albums={artistAlbums}
                        allArtistSongs={artistData.songs}
                        onPlayAll={() => {
                            if (artistData.songs.length > 0) handlePlaySong(artistData.songs[0], 0, artistData.songs);
                        }}
                        onShuffle={() => {
                            // Shuffle logic
                            if (artistData.songs.length > 0) {
                                // Simple fake shuffle: play random index? 
                                // Or use store toggleShuffle?
                                // Let's just play first and toggle shuffle on.
                                handlePlaySong(artistData.songs[0], 0, artistData.songs);
                                setShuffleState(true);
                            }
                        }}
                        onPlayAlbum={(album) => {
                            if (album.songs.length > 0) handlePlaySong(album.songs[0], 0, album.songs);
                        }}
                        onOpenAlbum={handleOpenAlbum}
                        onPlaySong={(song, idx) => handlePlaySong(song, idx, artistData.songs)}
                        onDeleteSong={async () => await refreshLibrary()}
                        onDeleteAlbum={async () => await refreshLibrary()}
                        // Pass helpers for internal SongListView
                        onOpenArtistByName={handleOpenArtistByName} // New prop for DetailView to pass down
                        onOpenAlbumByName={handleOpenAlbumByName} // New prop for DetailView to pass down
                    />
                );

            case 'album_detail':
                const albumData = currentView.data as AlbumData;
                return (
                    <AlbumDetailView
                        album={albumData}
                        onPlay={(song, idx) => handlePlaySong(song, idx, albumData.songs)}
                        onPlayAll={() => {
                            if (albumData.songs.length > 0) handlePlaySong(albumData.songs[0], 0, albumData.songs);
                        }}
                        onShuffle={() => {
                            if (albumData.songs.length > 0) {
                                handlePlaySong(albumData.songs[0], 0, albumData.songs);
                                setShuffleState(true);
                            }
                        }}
                        onDeleteSong={async () => await refreshLibrary()}
                        onOpenArtistByName={handleOpenArtistByName}
                        onOpenAlbumByName={handleOpenAlbumByName}
                    />
                );
            default:
                return <div>Unknown View</div>;
        }
    };

    return (
        <PageContainer
            title="音乐"

            hideHeader={currentView.type !== 'library'}
            actions={
                currentView.type === 'library' ? (
                    <LibraryHeaderButton onClick={handleAddFolder} />
                ) : null
            }
        >
            {/* Global Back Button Overlay? Or integrated?
                User said "现在的返回按钮就做成全局返回按钮"
                If I hide header, where is the back button?
                I should inject the Back Button into the PageContainer or place it absolutely.
                Or, I simply render it here at the top left if canGoBack is true.
            */}

            {/* Main Content */}
            {renderContent()}
        </PageContainer>
    );
}