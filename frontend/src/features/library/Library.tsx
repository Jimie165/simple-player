import { useState, useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { AnimatePresence, motion } from 'framer-motion';

import PageContainer from '@/components/layout/PageContainer';
import LibraryHeaderButton from '@/features/library/components/LibraryHeaderButton';
import SongListView from '@/features/library/components/SongListView';
import AlbumGridView from '@/features/library/components/AlbumGridView';
import ArtistGridView from '@/features/library/components/ArtistGridView';
import LibraryTabsAndShuffle from '@/features/library/components/LibraryTabsAndShuffle';
import AlbumSortMenu from '@/features/library/components/AlbumSortMenu';

import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type { ArtistData } from '@/features/library/components/ArtistGridView';

import { libraryService } from '@/services/libraryService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import type { SongMetadata } from '@/types';
import type { RecentItem } from '@/types';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { buildAlbums, buildArtists } from '@/features/library/utils/grouping';

export default function Library() {
    // Tab State: Synchronized with Navigation Store to support back navigation
    const { currentTab, setTab } = useNavigationStore();
    const activeTab: 'songs' | 'albums' | 'artists' =
        currentTab === 'albums' || currentTab === 'artists' || currentTab === 'songs'
            ? currentTab
            : 'songs';

    // Initial load: restore logic handled by useNavigationStore
    useEffect(() => {
        // Optional: Sync selection clearing ?
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

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let isMounted = true;

        const setupListeners = async () => {
            try {
                const unlistenFn = await listen('library_scan_complete', () => {
                    if (isMounted) {
                        refreshLibrary();
                    }
                });
                if (isMounted) {
                    unlisten = unlistenFn;
                } else {
                    unlistenFn();
                }
            } catch (err) {
                console.error('Failed to listen library scan events:', err);
            }
        };

        setupListeners();

        return () => {
            isMounted = false;
            if (unlisten) {
                try {
                    const result = unlisten() as any;
                    if (result instanceof Promise) {
                        result.catch((e: any) => console.warn('Failed to unlisten (async)', e));
                    }
                } catch (e) {
                    console.warn('Failed to unlisten (sync)', e);
                }
            }
        };
    }, []);




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
    const albums = useMemo(() => buildAlbums(librarySongs, albumSortKey), [librarySongs, albumSortKey]);

    // 2. 生成艺人列表 (包含专辑)
    const artists = useMemo(() => buildArtists(librarySongs), [librarySongs]);


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
        cover: null,
        cover_path: song.cover_path || null,
        path: song.path || '',
        lastPlayed: Date.now(),
        artist: song.artist,
        album: song.album,
        isLibraryItem: true
    });

    const handlePlaySong = async (
        song: SongMetadata,
        index: number,
        scopeSongs: SongMetadata[] = librarySongs,
        addToHistory = true,
        options?: { restartIfCurrent?: boolean, disableShuffle?: boolean },
        context?: { type: string, name: string, id?: string }
    ) => {
        await playSong({
            song,
            index,
            playlist: scopeSongs,
            options: {
                ...options,
                addToRecent: addToHistory,
                recentItem: addToHistory ? buildRecentForSong(song) : undefined
            },
            context: context || {
                type: 'library',
                name: '音乐库',
                id: 'library'
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
                <LibraryTabsAndShuffle
                    currentTab={activeTab}
                    onTabChange={handleTabChange}
                    librarySongs={librarySongs}
                    albums={albums}
                    artists={artists}
                    onShufflePlay={(songsToPlay) => {
                        shufflePlay({
                            songs: songsToPlay,
                            options: {
                                addToRecent: true,
                                buildRecentItem: buildRecentForSong
                            },
                            context: {
                                type: 'library',
                                name: '音乐库',
                                id: 'library'
                            }
                        });
                    }}
                />

                {/* Sort for Albums */}
                {activeTab === 'albums' && (
                    <AlbumSortMenu
                        albumSortKey={albumSortKey}
                        setAlbumSortKey={setAlbumSortKey}
                    />
                )}

                {/* Views */}
                <div className="flex-1 min-h-0 relative">
                    <AnimatePresence mode="wait">
                        {activeTab === 'songs' && (
                            <motion.div
                                key="songs"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="h-full"
                            >
                                <SongListView
                                    songs={librarySongs}
                                    onPlay={(song, index, options) => handlePlaySong(song, index, librarySongs, true, options)}
                                    onOpenArtist={handleOpenArtistByName}
                                    onOpenAlbum={handleOpenAlbumByName}
                                />
                            </motion.div>
                        )}
                        {activeTab === 'albums' && (
                            <motion.div
                                key="albums"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="h-full"
                            >
                                <AlbumGridView
                                    albums={albums}
                                    onPlayAlbum={(album) => {
                                        addToRecent({
                                            id: `album:${album.name}:${album.artist}`,
                                            type: 'album',
                                            title: album.name,
                                            artist: album.artist,
                                            description: `${album.songs.length} 首歌曲`,
                                            cover: null,
                                            cover_path: album.cover_path || null,
                                            path: album.songs[0]?.path || '',
                                            lastPlayed: Date.now(),
                                            isLibraryItem: true
                                        });
                                        if (album.songs.length > 0) {
                                            handlePlaySong(album.songs[0], 0, album.songs, false, { restartIfCurrent: true, disableShuffle: true }, { type: 'album_detail', name: album.name, id: album.name });
                                        }
                                    }}
                                    onShuffleAlbum={(album) => {
                                        if (album.songs.length > 0) {
                                            shufflePlay({ songs: album.songs, context: { type: 'album_detail', name: album.name, id: album.name } });
                                        }
                                    }}
                                    onOpenAlbum={handleOpenAlbum}
                                    onOpenArtist={(artistName) => {
                                        // Find artist data by name
                                        const found = artists.find(a => a.name === artistName);
                                        if (found) handleOpenArtist(found);
                                    }}
                                />
                            </motion.div>
                        )}
                        {activeTab === 'artists' && (
                            <motion.div
                                key="artists"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="h-full"
                            >
                                <ArtistGridView
                                    artists={artists}
                                    onPlayArtist={(artist) => {
                                        if (artist.songs.length > 0) {
                                            // Sort by album year desc
                                            const sorted = [...artist.songs].sort((a, b) => (b.year || 0) - (a.year || 0));
                                            handlePlaySong(sorted[0], 0, sorted, true, { restartIfCurrent: true, disableShuffle: true }, { type: 'artist_detail', name: artist.name, id: artist.name });
                                        }
                                    }}
                                    onShuffleArtist={(artist) => {
                                        if (artist.songs.length > 0) {
                                            shufflePlay({ songs: artist.songs, context: { type: 'artist_detail', name: artist.name, id: artist.name } });
                                        }
                                    }}
                                    onOpenArtist={handleOpenArtist}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </PageContainer>
    );
}
