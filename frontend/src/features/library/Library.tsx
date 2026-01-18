import { useState, useEffect, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';
import { MdMusicNote, MdAlbum, MdPerson, MdShuffle, MdSort, MdCheck } from 'react-icons/md';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';

import PageContainer from '../../components/layout/PageContainer';
import LibraryHeaderButton from './components/LibraryHeaderButton';
import SongListView from './components/SongListView';
// 引入新的 Grid 组件
import AlbumGridView from './components/AlbumGridView';
import AlbumDetailView from './components/AlbumDetailView';
import ArtistGridView from './components/ArtistGridView';
import type { AlbumData } from './components/AlbumGridView';
import type { ArtistData } from './components/ArtistGridView';

import { libraryService } from '../../services/libraryService';
import { audioService } from '../../services/audioService';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useNavigationStore } from '../../store/useNavigationStore';
import type { SongMetadata } from '../../types';

export default function Library() {
    const [currentTab, setCurrentTab] = useState<'songs' | 'albums' | 'artists'>('songs');
    const [selectedAlbum, setSelectedAlbum] = useState<AlbumData | null>(null);
    const [albumSortKey, setAlbumSortKey] = useState<'name' | 'artist'>('name');
    const [librarySongs, setLibrarySongs] = useState<SongMetadata[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const { setMetadata, setIsPlaying, setShuffleState, setRepeatState } = usePlayerStore();
    const { setPlaylist, setCurrentSongIndex, toggleShuffleList } = useLibraryStore();
    const setCustomBackHandler = useNavigationStore(state => state.setCustomBackHandler);

    // 监听 selectedAlbum 变化，注册/注销全局后退处理器
    useEffect(() => {
        if (selectedAlbum) {
            setCustomBackHandler(() => setSelectedAlbum(null));
        } else {
            setCustomBackHandler(null);
        }
        return () => setCustomBackHandler(null);
    }, [selectedAlbum, setCustomBackHandler]);

    // ... refreshLibrary ... (保持不变)
    const refreshLibrary = async () => {
        setIsLoading(true);
        try {
            const songs = await libraryService.scanLibrary();
            setLibrarySongs(songs);
        } catch (e) {
            console.error("Failed to scan library", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { refreshLibrary(); }, []);

    // ... handleAddFolder ... (保持不变)
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

        // 排序逻辑
        list.sort((a, b) => {
            if (albumSortKey === 'name') {
                return a.name.localeCompare(b.name);
            } else {
                return a.artist.localeCompare(b.artist);
            }
        });

        return list;
    }, [librarySongs, albumSortKey]);

    // 2. 生成艺人列表
    const artists = useMemo(() => {
        const map = new Map<string, ArtistData>();
        librarySongs.forEach(song => {
            const key = song.artist || "Unknown Artist";
            if (!map.has(key)) {
                map.set(key, {
                    name: key,
                    cover: song.cover || null, // 取第一首歌的封面作为艺人封面
                    count: 0,
                    songs: []
                });
            }
            const artist = map.get(key)!;
            artist.songs.push(song);
            artist.count += 1;
        });
        return Array.from(map.values());
    }, [librarySongs]);


    // --------------------------------------------------------
    // 【播放逻辑】
    // --------------------------------------------------------

    // 播放单曲
    // 通用播放逻辑：从指定列表中播放
    const handlePlayFromList = async (list: SongMetadata[], index: number) => {
        const song = list[index];
        if (!song || !song.path) return;

        setPlaylist(list);
        setRepeatState('all');
        toggleShuffleList(false);
        setCurrentSongIndex(index);
        setMetadata(song);
        await audioService.play(song.path, song);
        setIsPlaying(true);
    };

    // 播放专辑
    const handlePlayAlbum = async (album: AlbumData) => {
        if (album.songs.length === 0) return;
        // 播放列表只包含该专辑的歌
        setPlaylist(album.songs);
        setRepeatState('all');
        toggleShuffleList(false);

        // 播放第一首
        const first = album.songs[0];
        if (first.path) {
            setCurrentSongIndex(0);
            setMetadata(first);
            await audioService.play(first.path, first);
            setIsPlaying(true);
        }
    };

    // 播放艺人
    const handlePlayArtist = async (artist: ArtistData) => {
        if (artist.songs.length === 0) return;
        // 播放列表包含该艺人的所有歌
        setPlaylist(artist.songs);
        setRepeatState('all');
        toggleShuffleList(false);

        const first = artist.songs[0];
        if (first.path) {
            setCurrentSongIndex(0);
            setMetadata(first);
            await audioService.play(first.path, first);
            setIsPlaying(true);
        }
    };

    // 随机播放全部
    const handleShuffleAll = async () => {
        if (librarySongs.length === 0) return;
        setPlaylist(librarySongs);
        setShuffleState(true);
        setRepeatState('all');
        toggleShuffleList(true);
        const storeState = useLibraryStore.getState();
        const firstSong = storeState.playlist[0];
        if (firstSong && firstSong.path) {
            setCurrentSongIndex(0);
            setMetadata(firstSong);
            await audioService.play(firstSong.path, firstSong);
            setIsPlaying(true);
        }
    };

    // 随机播放特定专辑
    const handleShuffleAlbum = async (album: AlbumData) => {
        if (album.songs.length === 0) return;
        setPlaylist(album.songs);
        setShuffleState(true);
        setRepeatState('all');
        toggleShuffleList(true);
        const storeState = useLibraryStore.getState();
        const firstSong = storeState.playlist[0];
        if (firstSong && firstSong.path) {
            setCurrentSongIndex(0);
            setMetadata(firstSong);
            await audioService.play(firstSong.path, firstSong);
            setIsPlaying(true);
        }
    };

    const TabButton = ({ id, label, icon: Icon }: { id: typeof currentTab, label: string, icon: any }) => (
        <button
            onClick={() => {
                setCurrentTab(id);
                setSelectedAlbum(null); // 切换 Tab 时重置选中专辑
            }}
            className={clsx(
                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border",
                currentTab === id
                    ? "bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-100"
                    : "bg-transparent text-neutral-600 border-neutral-200 hover:bg-neutral-100 dark:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800"
            )}
        >
            <Icon className="text-lg" />
            <span>{label}</span>
        </button>
    );

    const handleDeleteSong = async (song: SongMetadata) => {
        if (!song.id) return;

        // 乐观更新：先从当前列表中移除
        setLibrarySongs(prev => prev.filter(s => s.id !== song.id));

        try {
            await libraryService.deleteSong(song.id);
            // 这里可以选择是否完全重载，如果只是简单删除，乐观更新就够了
            // await refreshLibrary(); 
        } catch (e) {
            console.error("Failed to delete song", e);
            // 如果失败，回滚（简单起见这里先只是重新加载）
            await refreshLibrary();
        }
    };

    return (
        <PageContainer
            title="音乐库"
            actions={<LibraryHeaderButton onClick={handleAddFolder} />}
            hideHeader={!!selectedAlbum} // 如果选中专辑，隐藏标题栏
        >
            <div className="flex flex-col h-full">
                {/* 如果没有选中专辑，显示 Tab Header */}
                {!selectedAlbum && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            <TabButton id="songs" label="歌曲" icon={MdMusicNote} />
                            <TabButton id="albums" label="专辑" icon={MdAlbum} />
                            <TabButton id="artists" label="艺人" icon={MdPerson} />
                        </div>

                        {librarySongs.length > 0 && (
                            <div className="flex items-center gap-3">
                                {/* 专辑排序菜单 */}
                                {currentTab === 'albums' && (
                                    <Menu as="div" className="relative">
                                        <MenuButton className="flex items-center gap-2 px-3 py-1.5 rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 transition-colors text-sm font-medium border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700">
                                            <MdSort className="text-lg" />
                                            <span>排序</span>
                                        </MenuButton>
                                        <MenuItems
                                            transition
                                            anchor="bottom end"
                                            className="w-40 origin-top-right rounded-xl border border-neutral-200 bg-white p-1 text-sm/6 text-neutral-900 shadow-lg ring-1 ring-black/5 focus:outline-none dark:bg-[#2c2c2c] dark:border-neutral-700 dark:text-white transition duration-100 ease-out [--anchor-gap:8px] z-50"
                                        >
                                            <MenuItem>
                                                <button
                                                    onClick={() => setAlbumSortKey('name')}
                                                    className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                                >
                                                    专辑名称
                                                    {albumSortKey === 'name' && <MdCheck className="text-blue-500" />}
                                                </button>
                                            </MenuItem>
                                            <MenuItem>
                                                <button
                                                    onClick={() => setAlbumSortKey('artist')}
                                                    className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                                >
                                                    艺人名称
                                                    {albumSortKey === 'artist' && <MdCheck className="text-blue-500" />}
                                                </button>
                                            </MenuItem>
                                        </MenuItems>
                                    </Menu>
                                )}

                                <button
                                    onClick={handleShuffleAll}
                                    className="flex items-center gap-2 px-4 py-1.5 rounded-full text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-colors text-sm font-medium"
                                >
                                    <MdShuffle className="text-lg" />
                                    <span>随机播放全部 ({librarySongs.length})</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64 text-neutral-400">
                            加载中...
                        </div>
                    ) : librarySongs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
                            <p>库里还没有歌曲</p>
                            <p className="text-sm mt-2">点击右上角“添加文件夹”开始导入</p>
                        </div>
                    ) : (
                        <>
                            {currentTab === 'songs' && (
                                <SongListView
                                    songs={librarySongs}
                                    onPlay={(_, index) => handlePlayFromList(librarySongs, index)}
                                    onDelete={handleDeleteSong}
                                />
                            )}
                            {currentTab === 'albums' && (
                                selectedAlbum ? (
                                    <AlbumDetailView
                                        album={selectedAlbum}
                                        onPlay={(_, index) => handlePlayFromList(selectedAlbum.songs, index)}
                                        onPlayAll={() => handlePlayAlbum(selectedAlbum)}
                                        onShuffle={() => handleShuffleAlbum(selectedAlbum)}
                                        onDeleteSong={handleDeleteSong}
                                    />
                                ) : (
                                    <AlbumGridView
                                        albums={albums}
                                        onPlayAlbum={handlePlayAlbum}
                                        onOpenAlbum={setSelectedAlbum}
                                    />
                                )
                            )}
                            {currentTab === 'artists' && (
                                <ArtistGridView artists={artists} onPlayArtist={handlePlayArtist} />
                            )}
                        </>
                    )}
                </div>
            </div>
        </PageContainer>
    );
}