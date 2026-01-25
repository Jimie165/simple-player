import { useState, useEffect, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';
import { MdMusicNote, MdAlbum, MdPerson, MdSort, MdCheck, MdShuffle } from 'react-icons/md';

import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';

import PageContainer from '../../components/layout/PageContainer';
import LibraryHeaderButton from './components/LibraryHeaderButton';
import SongListView from './components/SongListView';
import AlbumGridView from './components/AlbumGridView';
import ArtistGridView from './components/ArtistGridView';

import type { AlbumData } from './components/AlbumGridView';
import type { ArtistData } from './components/ArtistGridView';

import { libraryService } from '../../services/libraryService';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useNavigationStore } from '../../store/useNavigationStore';
import { useSelectionStore } from '../../store/useSelectionStore';
import type { SongMetadata } from '../../types';
import type { RecentItem } from '../../types';
import { usePlaybackActions } from '../../hooks/usePlaybackActions';

export default function Library() {
    // Tab State: Synchronized with Navigation Store to support back navigation
    const { currentTab, setTab } = useNavigationStore();

    // Initial load: restore from localStorage if needed
    useEffect(() => {
        const saved = localStorage.getItem('library_active_tab');
        if (saved && (saved === 'songs' || saved === 'albums' || saved === 'artists')) {
            // Only set if different from default to avoid unnecessary history entry
            if (saved !== currentTab && useNavigationStore.getState().mainHistory.length === 0) {
                setTab(saved);
            }
        }
    }, []);

    const handleTabChange = (tab: 'songs' | 'albums' | 'artists') => {
        // Switching tabs should exit selection mode immediately
        useSelectionStore.getState().clearSelection();
        setTab(tab);
        try { localStorage.setItem('library_active_tab', tab); } catch { }
    };

    // Sort logic
    const [albumSortKey, setAlbumSortKey] = useState<'name' | 'artist'>('name');
    // Store Actions
    // Store Actions
    const { addToRecent, libraryVersion } = useLibraryStore();
    const { playSong, shufflePlay } = usePlaybackActions();
    const { push } = useNavigationStore();

    // Local State
    const [librarySongs, setLibrarySongs] = useState<SongMetadata[]>([]);

    // Filtered & Sorted Logic
    // ...

    useEffect(() => {
        refreshLibrary();
    }, [libraryVersion]);

    const refreshLibrary = async () => {
        try {
            const songs = await libraryService.getLibrarySongs();
            setLibrarySongs(songs);
        } catch (error) {
            console.error('Failed to load library:', error);
        }
    };


    const deleteSong = async (song: SongMetadata) => {
        if (song.id) {
            await libraryService.deleteSong(song.id as number);
            // 本地过滤，保持原有顺序
            setLibrarySongs(prev => prev.filter(s => s.id !== song.id));
        }
    };

    const deleteAlbum = async (album: AlbumData) => {
        const ids = album.songs.map(s => s.id).filter((id): id is number => id !== undefined);
        if (ids.length > 0) {
            await libraryService.batchDeleteSongs(ids);
            // 本地过滤
            const idSet = new Set(ids);
            setLibrarySongs(prev => prev.filter(s => !s.id || !idSet.has(s.id as number)));
        }
    };

    const deleteArtist = async (artist: ArtistData) => {
        const ids = artist.songs.map(s => s.id).filter((id): id is number => id !== undefined);
        if (ids.length > 0) {
            await libraryService.batchDeleteSongs(ids);
            // 本地过滤
            const idSet = new Set(ids);
            setLibrarySongs(prev => prev.filter(s => !s.id || !idSet.has(s.id as number)));
        }
    };

    useEffect(() => { refreshLibrary(); }, []);

    const handleAddFolder = async () => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
                const songs = await libraryService.addFolder(selected);
                setLibrarySongs(songs);
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
                    cover_path: song.cover_path || null,
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
    // Navigation Handlers (Push to Global Stack)
    // --------------------------------------------------------
    const handleOpenArtist = (artist: ArtistData) => {
        useSelectionStore.getState().clearSelection();
        push({ type: 'artist_detail', data: artist });
    };

    const handleOpenAlbum = (album: AlbumData) => {
        useSelectionStore.getState().clearSelection();
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

    const buildRecentForSong = (song: SongMetadata): RecentItem => ({
        id: song.path || '',
        type: 'file',
        title: song.title,
        description: song.artist,
        cover: song.cover || null,
        cover_path: song.cover_path || null,
        path: song.path || '',
        lastPlayed: Date.now(),
        artist: song.artist,
        isLibraryItem: true
    });

    const handlePlaySong = async (
        song: SongMetadata,
        index: number,
        scopeSongs: SongMetadata[] = librarySongs,
        addToHistory = true,
        options?: { restartIfCurrent?: boolean }
    ) => {
        await playSong({
            song,
            index,
            playlist: scopeSongs,
            options: {
                ...options,
                addToRecent: addToHistory,
                recentItem: addToHistory ? buildRecentForSong(song) : undefined
            }
        });
    };

    // --------------------------------------------------------
    // Render Content Switcher
    // --------------------------------------------------------
    // We strictly render the List View here. Detail views are handled by GlobalDetailStack.

    return (
        <PageContainer
            title="音乐"
            hideHeader={false}
            actions={
                <div className="flex items-center gap-2">
                    <LibraryHeaderButton onClick={handleAddFolder} />
                </div>
            }
        >

            {/* Main Content */}
            <div className="flex flex-col h-full">
                {/* Header: Tabs on left, Shuffle on right */}
                <div className="flex items-center justify-between mb-6">
                    {/* Tab 按钮组 */}
                    <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
                        {[
                            { id: 'songs', label: '歌曲', icon: MdMusicNote },
                            { id: 'albums', label: '专辑', icon: MdAlbum },
                            { id: 'artists', label: '艺人', icon: MdPerson },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id as any)}
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
                        ))
                        }
                    </div>

                    {/* 随机播放按钮 - 胶囊状，右侧 */}
                    <button
                        onClick={() => {
                            // 根据当前 tab 决定播放哪组歌曲
                            let songsToPlay: SongMetadata[] = [];
                            if (currentTab === 'songs') {
                                songsToPlay = [...librarySongs];
                            } else if (currentTab === 'albums' && albums.length > 0) {
                                songsToPlay = albums.flatMap(a => a.songs);
                            } else if (currentTab === 'artists' && artists.length > 0) {
                                songsToPlay = artists.flatMap(a => a.songs);
                            }

                            if (songsToPlay.length > 0) {
                                shufflePlay({
                                    songs: songsToPlay,
                                    options: {
                                        addToRecent: true,
                                        buildRecentItem: buildRecentForSong
                                    }
                                });
                            }
                        }}

                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-on-primary font-medium text-sm transition-colors shadow-sm active:scale-95"
                    >
                        <MdShuffle className="text-lg" />
                        随机播放
                    </button>
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
                                className="w-40 origin-top-right rounded-xl border border-neutral-200/50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-1 text-sm text-neutral-900 shadow-2xl ring-1 ring-black/5 focus:outline-none dark:border-neutral-700/50 dark:text-white z-50 mt-2"
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
                            onPlay={(song, index, options) => handlePlaySong(song, index, librarySongs, true, options)}
                            onDelete={deleteSong}
                            onOpenArtist={handleOpenArtistByName}
                            onOpenAlbum={handleOpenAlbumByName}
                        />
                    )}
                    {currentTab === 'albums' && (
                        <AlbumGridView
                            albums={albums}
                            onPlayAlbum={(album) => {
                                addToRecent({
                                    id: `album:${album.name}:${album.artist}`,
                                    type: 'album',
                                    title: album.name,
                                    artist: album.artist,
                                    description: `${album.songs.length} 首歌曲`,
                                    cover: album.cover,
                                    cover_path: album.cover_path || null,
                                    path: album.songs[0]?.path || '',
                                    lastPlayed: Date.now(),
                                    isLibraryItem: true
                                });
                                if (album.songs.length > 0) {
                                    handlePlaySong(album.songs[0], 0, album.songs, false, { restartIfCurrent: true });
                                }
                            }}
                            onShuffleAlbum={(album) => {
                                if (album.songs.length > 0) {
                                    shufflePlay({ songs: album.songs });
                                }
                            }}
                            onOpenAlbum={handleOpenAlbum}
                            onOpenArtist={(artistName) => {
                                // Find artist data by name
                                const found = artists.find(a => a.name === artistName);
                                if (found) handleOpenArtist(found);
                            }}
                            onDeleteAlbum={deleteAlbum}
                        />
                    )}
                    {currentTab === 'artists' && (
                        <ArtistGridView
                            artists={artists}
                            onPlayArtist={(artist) => {
                                if (artist.songs.length > 0) {
                                    handlePlaySong(artist.songs[0], 0, artist.songs, true, { restartIfCurrent: true });
                                }
                            }}
                            onShuffleArtist={(artist) => {
                                if (artist.songs.length > 0) {
                                    shufflePlay({ songs: artist.songs });
                                }
                            }}
                            onOpenArtist={handleOpenArtist}
                            onDeleteArtist={deleteArtist}
                        />
                    )}
                </div>
            </div>
        </PageContainer>
    );
}
