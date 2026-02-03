import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';
import { MdFolder, MdCheckBox, MdCheckBoxOutlineBlank, MdFavorite, MdVideocam } from 'react-icons/md';
import PageContainer from '@/components/layout/PageContainer';
import OpenFileMenu from './components/OpenFileMenu';
import EmptyState from './components/EmptyState';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { fileService } from '@/services/fileService';
import { libraryService } from '@/services/libraryService';
import { audioService } from '@/services/audioService';
import { usePlaybackActions } from '@/hooks/usePlaybackActions';

import type { RecentItem } from '@/types';
import type { SongMetadata } from '@/types';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import CoverImage from '@/components/common/CoverImage';
import PlaylistCoverCollage from '@/components/common/PlaylistCoverCollage';
import { sortSongs } from '@/utils/songSort';
import { formatTime } from '@/utils/time';

import CardPlayButton from '@/components/common/CardPlayButton';

// 视频文件扩展名常量
const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'm4v', '3gp', 'ts', 'rmvb', 'wmv', 'asf', 'ogv'];

interface MusicGridProps {
    onNavigateToLibrary?: () => void;
}

/**
 * 专门为最近播放列表定义的封面组件，负责内部加载歌曲数据以生成拼接封面
 */
function PlaylistGridCover({ item }: { item: RecentItem }) {
    const [songs, setSongs] = useState<SongMetadata[]>([]);
    const { getPlaylistSettings, libraryVersion } = useLibraryStore();

    useEffect(() => {
        const load = async () => {
            const plIdStr = item.id.replace('playlist:', '');
            let plSongs: SongMetadata[] = [];
            if (plIdStr === 'favorites') {
                plSongs = await libraryService.getFavorites();
            } else {
                const plId = parseInt(plIdStr);
                if (!isNaN(plId)) {
                    const raw = await libraryService.getPlaylistSongs(plId);
                    const settings = getPlaylistSettings(plIdStr);
                    plSongs = sortSongs(raw, settings.sortKey, settings.sortOrder);
                }
            }
            setSongs(plSongs);
        };
        load();
    }, [item.id, getPlaylistSettings, libraryVersion]);

    return <PlaylistCoverCollage songs={songs} className="w-full h-full" />;
}

export default function MusicGrid({ onNavigateToLibrary: _onNavigateToLibrary }: MusicGridProps) {
    // Store Actions
    const { recentHistory } = useLibraryStore();
    const { playSong, playList } = usePlaybackActions();
    const { isSelectionMode, selectedIds, toggleSelection, toggleSelectionMode, selectAllRequested, setSelectAllRequested, selectAll, setSelectableIds } = useSelectionStore();

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: RecentItem } | null>(null);
    const [pendingFolderPlay, setPendingFolderPlay] = useState<{
        folderPath: string;
        folderName: string;
        audioSongs: SongMetadata[];
        videoSongs: SongMetadata[];
    } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, item: RecentItem) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, item });
    };

    useEffect(() => {
        if (selectAllRequested && isSelectionMode) {
            const items = recentHistory.map(item => ({ id: item.id, data: item }));
            selectAll(items, 'recent');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, recentHistory, selectAll, setSelectAllRequested]);

    useEffect(() => {
        if (!isSelectionMode) return;
        setSelectableIds(recentHistory.map(item => item.id));
    }, [isSelectionMode, recentHistory, setSelectableIds]);

    // Helper: Check if file is video
    const isVideoFile = (path: string): boolean => {
        const ext = path.split('.').pop()?.toLowerCase() || '';
        return VIDEO_EXTENSIONS.includes(ext);
    };

    // Helper: Play Video File
    const playVideoFile = async (path: string, meta: SongMetadata) => {
        const queue: SongMetadata[] = [{
            ...meta,
            path: path
        }];

        const { setVideoQueue, setVideoMetadata, setVideoMode, setIsPlaying } = usePlayerStore.getState();

        setVideoQueue(queue, 0);
        setVideoMetadata(queue[0]);
        setVideoMode(true);

        // 暂停音乐
        if (usePlayerStore.getState().isPlaying) {
            await audioService.pause();
            setIsPlaying(false);
        }
    };

    // Helper: Play Single File
    const buildRecentForFile = (path: string, meta: SongMetadata, isLibraryItem: boolean, existing?: RecentItem): RecentItem => {
        const isVideo = isVideoFile(path);

        if (existing) {
            // 关键修复：即便项已存在，也要确保 path 和 cover_path 被补全/更新
            return {
                ...existing,
                path: existing.path || path,
                cover_path: existing.cover_path || meta.cover_path || null,
                cover: existing.cover || meta.cover || null,
                lastPlayed: Date.now(),
                // 如果旧数据缺少描述（例如显示为 Unknown Artist），也可以在这里顺便优化
                description: (existing.description === "Unknown Artist" || !existing.description)
                    ? (isVideo ? formatTime(meta.duration) : meta.artist)
                    : existing.description
            };
        }
        return {
            id: path,
            type: 'file',
            title: meta.title,
            description: isVideo ? formatTime(meta.duration) : meta.artist,
            cover: meta.cover || null,
            cover_path: meta.cover_path || null,
            path,
            lastPlayed: Date.now(),
            artist: isVideo ? "" : meta.artist,
            album: isVideo ? "" : meta.album,
            isLibraryItem
        };
    };

    const playSingleFile = async (path: string, isLibraryItem = false, existingRecent?: RecentItem) => {
        try {
            let meta: SongMetadata | null = null;
            try { meta = await fileService.getMetadata(path); } catch { /* ignore metadata errors */ }

            const safeMeta = meta || {
                title: path.split(/[\\/]/).pop() || 'Unknown',
                artist: 'Unknown Artist', album: 'Unknown Album', duration: 0, cover: null, path: path
            };

            // 检测是否为视频文件
            if (isVideoFile(path)) {
                // 添加到最近使用
                const recentItem = buildRecentForFile(path, safeMeta, isLibraryItem, existingRecent);
                useLibraryStore.getState().addToRecent(recentItem);
                // 播放视频
                await playVideoFile(path, safeMeta);
            } else {
                // 播放音频
                await playSong({
                    song: safeMeta,
                    index: 0,
                    playlist: [safeMeta],
                    options: {
                        restartIfCurrent: true,
                        recentItem: buildRecentForFile(path, safeMeta, isLibraryItem, existingRecent)
                    },
                    context: {
                        type: 'home',
                        name: '主页',
                        id: 'home'
                    }
                });
            }
        } catch (err) { console.error("Play single file failed", err); }
    };

    const buildFolderRecentItem = (
        folderPath: string,
        folderName: string,
        items: SongMetadata[],
        label: string,
    ): RecentItem => ({
        id: folderPath,
        type: 'folder',
        title: folderName,
        description: `${items.length} ${label}`,
        cover: items[0]?.cover || null,
        cover_path: items[0]?.cover_path || null,
        path: folderPath,
        lastPlayed: Date.now(),
    });

    const playVideoList = async (videos: SongMetadata[], recentItem: RecentItem) => {
        if (videos.length === 0) return;
        const { setVideoQueue, setVideoMetadata, setVideoMode, setIsPlaying } = usePlayerStore.getState();
        setVideoQueue(videos, 0);
        setVideoMetadata(videos[0]);
        setVideoMode(true);
        if (usePlayerStore.getState().isPlaying) {
            await audioService.pause();
            setIsPlaying(false);
        }
        useLibraryStore.getState().addToRecent(recentItem);
    };

    const playAudioList = async (songs: SongMetadata[], recentItem: RecentItem) => {
        if (songs.length === 0) return;
        await playList({
            songs,
            startIndex: 0,
            options: {
                restartIfCurrent: true,
                recentItem,
            },
            context: {
                type: 'home',
                name: '主页',
                id: 'home',
            }
        });
    };

    const playFolderItems = async (folderPath: string, songs: SongMetadata[], folderName: string) => {
        const audioSongs = songs.filter(s => s.path && !isVideoFile(s.path));
        const videoSongs = songs.filter(s => s.path && isVideoFile(s.path));

        if (audioSongs.length > 0 && videoSongs.length > 0) {
            setPendingFolderPlay({
                folderPath,
                folderName,
                audioSongs,
                videoSongs,
            });
            return;
        }

        if (videoSongs.length > 0) {
            const recentItem = buildFolderRecentItem(folderPath, folderName, videoSongs, "个视频");
            await playVideoList(videoSongs, recentItem);
            return;
        }

        if (audioSongs.length > 0) {
            const recentItem = buildFolderRecentItem(folderPath, folderName, audioSongs, "首歌曲");
            await playAudioList(audioSongs, recentItem);
        }
    };

    // Core: Handle Recent Item Click (Primary Action)
    const handleItemClick = async (item: RecentItem, e?: React.MouseEvent) => {
        const id = item.id;

        // Selection Mode Logic
        if (isSelectionMode) {
            e?.stopPropagation();
            toggleSelection(id, item.type, item);
            return;
        }

        // Helper to play a list
        const playListHelper = async (songs: SongMetadata[]) => {
            if (songs.length === 0) return;
            const firstSong = songs[0];
            if (!firstSong.path) return;

            // 检测第一个文件是否为视频
            if (isVideoFile(firstSong.path)) {
                // 播放视频
                const { setVideoQueue, setVideoMetadata, setVideoMode, setIsPlaying } = usePlayerStore.getState();

                setVideoQueue(songs, 0);
                setVideoMetadata(songs[0]);
                setVideoMode(true);

                // 暂停音乐
                if (usePlayerStore.getState().isPlaying) {
                    await audioService.pause();
                    setIsPlaying(false);
                }

                // 添加到最近使用
                useLibraryStore.getState().addToRecent({ ...item, lastPlayed: Date.now() });
            } else {
                // 播放音频
                await playList({
                    songs,
                    startIndex: 0,
                    options: {
                        restartIfCurrent: true,
                        recentItem: { ...item, lastPlayed: Date.now() }
                    },
                    context: {
                        type: 'home',
                        name: '主页',
                        id: 'home'
                    }
                });
            }
        };

        // Normal Playback Logic
        if (item.type === 'folder') {
            try {
                const songs = await fileService.readFolder(item.path);
                const folderName = item.title || item.path.split(/[\\/]/).pop() || "Unknown Folder";
                await playFolderItems(item.path, songs, folderName);
            } catch (e) {
                console.error("Failed to play folder", e);
            }
        } else if (item.type === 'album') {
            try {
                const allSongs = await libraryService.scanLibrary();
                const albumSongs = allSongs.filter(s =>
                    s.album === item.title &&
                    (item.artist ? s.artist === item.artist : true)
                );
                await playListHelper(albumSongs);
            } catch (err) {
                console.error("Failed to play recent album", err);
            }
        } else if (item.type === 'playlist') {
            try {
                // Parse ID "playlist:123" -> 123
                const plIdStr = item.id.replace('playlist:', '');
                let songs: SongMetadata[] = [];

                if (plIdStr === 'favorites') {
                    songs = await libraryService.getFavorites();
                } else {
                    const plId = parseInt(plIdStr);
                    if (!isNaN(plId)) {
                        const rawSongs = await libraryService.getPlaylistSongs(plId);
                        const { getPlaylistSettings } = useLibraryStore.getState();
                        const settings = getPlaylistSettings(plIdStr);
                        songs = sortSongs(rawSongs, settings.sortKey, settings.sortOrder);
                    }
                }
                await playListHelper(songs);
            } catch (err) {
                console.error("Failed to play recent playlist", err);
            }
        } else if (item.type === 'video') {
            try {
                // 构造基本的 SongMetadata 进行播放
                const meta: SongMetadata = {
                    id: -1, // 临时 ID
                    title: item.title,
                    artist: item.artist || 'Unknown',
                    album: item.album || 'Unknown',
                    duration: 0, // 可能需要从 ID 或其他地方恢复，或者不重要
                    path: item.path,
                    cover_path: item.cover_path,
                };
                await playVideoFile(item.path, meta);
            } catch (e) {
                console.error("Failed to play recent video", e);
            }
        } else {
            playSingleFile(item.path, item.isLibraryItem, item);
        }
    };

    const handleOpenFolder = async () => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
                const songs = await fileService.readFolder(selected);
                if (songs.length === 0) return;
                const folderName = selected.split(/[\\/]/).pop() || "Unknown Folder";
                await playFolderItems(selected, songs, folderName);
            }
        } catch (err) {
            console.error('Failed to open folder:', err);
        }
    };

    const handleOpenFile = async () => {
        const selected = await open({
            multiple: false,
            filters: [
                { name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a'] },
                { name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv'] }
            ]
        });
        if (selected && typeof selected === 'string') {
            playSingleFile(selected);
        }
    };

    return (
        <PageContainer
            title="主页"
            actions={<OpenFileMenu onOpenFile={handleOpenFile} onOpenFolder={handleOpenFolder} />}
        >
            <section>
                {pendingFolderPlay && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-2xl bg-white/90 dark:bg-neutral-900/90 border border-neutral-200/70 dark:border-neutral-700/70 shadow-2xl p-5">
                            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                                检测到混合媒体
                            </h3>
                            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
                                该文件夹同时包含视频和音乐，请选择播放类型。
                            </p>
                            <div className="mt-4 flex gap-3">
                                <button
                                    onClick={async () => {
                                        const { folderPath, folderName, videoSongs } = pendingFolderPlay;
                                        setPendingFolderPlay(null);
                                        const recentItem = buildFolderRecentItem(folderPath, folderName, videoSongs, "个视频");
                                        await playVideoList(videoSongs, recentItem);
                                    }}
                                    className="flex-1 rounded-xl bg-primary text-on-primary px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
                                >
                                    播放视频
                                </button>
                                <button
                                    onClick={async () => {
                                        const { folderPath, folderName, audioSongs } = pendingFolderPlay;
                                        setPendingFolderPlay(null);
                                        const recentItem = buildFolderRecentItem(folderPath, folderName, audioSongs, "首歌曲");
                                        await playAudioList(audioSongs, recentItem);
                                    }}
                                    className="flex-1 rounded-xl bg-neutral-200/80 dark:bg-neutral-800/80 text-neutral-800 dark:text-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                >
                                    播放音乐
                                </button>
                            </div>
                            <button
                                onClick={() => setPendingFolderPlay(null)}
                                className="mt-3 w-full rounded-xl px-4 py-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                )}
                <h2 className="mb-4 text-xl font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                    <span>最近使用</span>
                </h2>

                {recentHistory.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                        {recentHistory.map((item) => {
                            const isSelected = selectedIds.has(item.id);

                            return (
                                <div
                                    key={item.id}
                                    className="group flex flex-col gap-3 rounded-2xl p-4 -mx-4 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer relative"
                                    onClick={(e) => handleItemClick(item, e)}
                                    onContextMenu={(e) => handleContextMenu(e, item)}
                                >
                                    <div className="aspect-square w-full rounded-2xl shadow-sm bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative border border-black/5 dark:border-white/5 flex items-center justify-center">
                                        {item.type === 'folder' ? (
                                            <MdFolder className="text-6xl text-blue-400 opacity-80" />
                                        ) : item.type === 'video' ? (
                                            item.cover_path ? (
                                                <CoverImage
                                                    src={item.cover_path}
                                                    className="w-full h-full group-hover:scale-110 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
                                                    <MdVideocam className="text-6xl text-neutral-600" />
                                                </div>
                                            )
                                        ) : item.type === 'playlist' ? (
                                            item.id === 'playlist:favorites' ? (
                                                <div className="w-full h-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
                                                    <MdFavorite className="text-6xl text-white drop-shadow-md" />
                                                </div>
                                            ) : item.cover_path ? (
                                                <CoverImage src={item.cover_path} className="w-full h-full" />
                                            ) : (
                                                <PlaylistGridCover item={item} />
                                            )
                                        ) : (
                                            <CoverImage
                                                song={{
                                                    title: item.title,
                                                    artist: item.artist || '',
                                                    album: '',
                                                    duration: 0,
                                                    path: item.path,
                                                    cover: item.cover,
                                                    cover_path: item.cover_path
                                                }}
                                                className="w-full h-full group-hover:scale-[1.02] transition-transform duration-500 ease-out"
                                                iconClassName="text-6xl opacity-50"
                                            />
                                        )}

                                        {isSelected && (
                                            <div className="absolute inset-0 bg-black/40 z-10 transition-opacity duration-300" />
                                        )}

                                        {isSelectionMode && (
                                            <div className="absolute top-2 left-2 z-20">
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); toggleSelection(item.id, item.type, item); }}
                                                    className="w-6 h-6 rounded bg-white/40 backdrop-blur-sm flex items-center justify-center hover:bg-white/60 transition-colors"
                                                >
                                                    {isSelected
                                                        ? <MdCheckBox className="text-primary text-xl" />
                                                        : <MdCheckBoxOutlineBlank className="text-neutral-700 text-xl" />
                                                    }
                                                </div>
                                            </div>
                                        )}

                                        {!isSelectionMode && (
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                <CardPlayButton onClick={() => handleItemClick(item)} className="bottom-3 left-3" />
                                                <SmartMusicContextMenu
                                                    className="absolute bottom-3 right-3"
                                                    buttonClassName="w-10 h-10"
                                                    items={item}
                                                    context="recent"
                                                    onPlay={() => handleItemClick(item)}
                                                    isSelected={isSelected}
                                                    onSelect={() => isSelectionMode
                                                        ? toggleSelection(item.id, item.type, item)
                                                        : toggleSelectionMode({ id: item.id, type: item.type, data: item })
                                                    }
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-0.5 px-1">
                                        <span className={clsx(
                                            "truncate text-base font-semibold",
                                            isSelected ? "text-primary" : "text-neutral-900 dark:text-neutral-50"
                                        )} title={item.title}>
                                            {item.title}
                                        </span>
                                        <span className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={item.description}>
                                            {item.description}
                                            {/* 如果是非视频且有专辑信息才显示专辑 */}
                                            {!isVideoFile(item.path) && item.album && ` — ${item.album}`}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {contextMenu && (
                    <SmartCursorContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        item={contextMenu.item}
                        context="recent"
                        onClose={() => setContextMenu(null)}
                        isSelected={selectedIds.has(contextMenu.item.id)}
                        onSelect={() => {
                            const { id, type } = contextMenu.item;
                            if (isSelectionMode) {
                                toggleSelection(id, type, contextMenu.item);
                            } else {
                                toggleSelectionMode({ id, type, data: contextMenu.item });
                            }
                            setContextMenu(null);
                        }}
                    />
                )}
            </section>
        </PageContainer>
    );
}
