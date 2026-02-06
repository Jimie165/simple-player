import React, { useEffect, useMemo, useState } from 'react';
import { useVideoStore } from '@/store/useVideoStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import clsx from 'clsx';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { libraryService } from '@/services/libraryService';
import LibraryHeaderButton from '@/features/library/components/LibraryHeaderButton';
import { AnimatePresence, motion } from 'framer-motion';
import PageContainer from '@/components/layout/PageContainer';
import type { VideoMetadata, SongMetadata } from '@/types';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { MdFolder, MdCheckBox, MdCheckBoxOutlineBlank, MdSort, MdCheck, MdExpandMore, MdExpandLess } from 'react-icons/md';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { useDialogStore } from '@/store/useDialogStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { audioService } from '@/services/audioService';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import { getMusicItemId } from '@/utils/musicItemUtils';
import { formatTime } from '@/utils/time';
import { Virtuoso } from 'react-virtuoso';
import VirtualizedGrid from '@/components/common/VirtualizedGrid';
import { VideoCard } from './components/VideoCard';

import { useVideoScanProgress } from '@/hooks/useVideoScanProgress';

export const VideoLibrary: React.FC = () => {
    const { scanning, progress } = useVideoScanProgress();
    const { videos, fetchVideos, setVideos, videoFolders, fetchVideoFolders, foldersRefreshing, collapsedFolderIds, toggleFolderCollapse, sortBy, sortOrder, setSortBy, setSortOrder } = useVideoStore();
    const { currentTab, currentPage, lastVideoTab, setTab } = useNavigationStore();
    const { isSelectionMode, selectAllRequested, setSelectAllRequested, selectAll, selectionType, setSelectableIds, selectItem, deselectItem, selectedIds } = useSelectionStore();
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

    // Use currentTab if we are on the page, otherwise fall back to lastVideoTab to prevent switch animation during exit
    const effectiveTab = currentPage === 'videos' ? currentTab : (lastVideoTab || 'all');
    const activeTab = effectiveTab === 'folders' ? 'folders' : 'all';

    useEffect(() => {
        fetchVideos();
        fetchVideoFolders();
    }, [fetchVideos, fetchVideoFolders]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let isMounted = true;

        const setupListeners = async () => {
            try {
                const unlistenFn = await listen('video_scan_complete', () => {
                    if (isMounted) {
                        fetchVideos();
                        fetchVideoFolders();
                    }
                });
                if (isMounted) {
                    unlisten = unlistenFn;
                } else {
                    unlistenFn();
                }
            } catch (err) {
                console.error('Failed to listen video scan events:', err);
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
    }, [fetchVideos, fetchVideoFolders]);

    useEffect(() => {
        const el = document.querySelector('[data-scroll-viewport]');
        if (el instanceof HTMLElement) setScrollParent(el);
    }, []);

    const handleSelectFolder = (folderVideos: VideoMetadata[], isSelected: boolean) => {
        if (isSelected) {
            folderVideos.forEach(v => deselectItem(v.path));
        } else {
            folderVideos.forEach(v => selectItem(v.path, 'video', v));
        }
    };

    // Apply Sort to All Videos
    const sortedVideos = useMemo(() => {
        return [...videos].sort((a, b) => {
            let res = 0;
            if (sortBy === 'name') {
                const valA = a.title;
                const valB = b.title;
                const isAsciiA = /^[\x00-\x7F]/.test(valA);
                const isAsciiB = /^[\x00-\x7F]/.test(valB);

                if (isAsciiA && !isAsciiB) {
                    res = -1;
                } else if (!isAsciiA && isAsciiB) {
                    res = 1;
                } else {
                    res = valA.localeCompare(valB, 'zh-CN', { numeric: true, sensitivity: 'base' });
                }

                if (sortOrder === 'desc') res = -res;
            } else if (sortBy === 'created') {
                const timeA = new Date(a.created_at).getTime() || 0;
                const timeB = new Date(b.created_at).getTime() || 0;
                res = timeA - timeB;
                if (sortOrder === 'desc') res = timeB - timeA;
            } else if (sortBy === 'played') {
                const timeA = a.last_played_at ? new Date(a.last_played_at).getTime() : 0;
                const timeB = b.last_played_at ? new Date(b.last_played_at).getTime() : 0;
                res = timeA - timeB;
                if (sortOrder === 'desc') res = timeB - timeA;
            }
            return res;
        });
    }, [videos, sortBy, sortOrder]);

    useEffect(() => {
        if (selectAllRequested && isSelectionMode && (selectionType === 'video' || !selectionType)) {
            const items = sortedVideos.map(v => ({
                id: v.path,
                data: v
            }));
            selectAll(items, 'video');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, sortedVideos, selectAll, setSelectAllRequested, selectionType]);

    useEffect(() => {
        if (!isSelectionMode) return;
        setSelectableIds(sortedVideos.map(v => v.path));
    }, [isSelectionMode, sortedVideos, setSelectableIds]);

    const handleAddFolder = async () => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
                const updated = await libraryService.addVideoFolder(selected);
                setVideos(updated);
                await fetchVideoFolders();
            }
        } catch (err) {
            console.error('添加视频文件夹失败:', err);
        }
    };

    // Group videos by folder (Sorted inside)
    const groupedVideos = useMemo(() => {
        const groups = new Map<number, VideoMetadata[]>();
        const groupMaxPlayed = new Map<number, number>();

        sortedVideos.forEach(v => {
            if (v.folder_id) {
                if (!groups.has(v.folder_id)) groups.set(v.folder_id, []);
                groups.get(v.folder_id)!.push(v);

                const currentMax = groupMaxPlayed.get(v.folder_id) || 0;
                const videoPlayed = v.last_played_at ? new Date(v.last_played_at).getTime() : 0;
                if (videoPlayed > currentMax) {
                    groupMaxPlayed.set(v.folder_id, videoPlayed);
                }
            }
        });

        const sortedFolders = [...videoFolders].sort((a, b) => {
            let res = 0;
            if (sortBy === 'name') {
                const nameA = a.path.split(/[/\\]/).pop() || '';
                const nameB = b.path.split(/[/\\]/).pop() || '';
                const isAsciiA = /^[\x00-\x7F]/.test(nameA);
                const isAsciiB = /^[\x00-\x7F]/.test(nameB);

                if (isAsciiA && !isAsciiB) {
                    res = -1;
                } else if (!isAsciiA && isAsciiB) {
                    res = 1;
                } else {
                    res = nameA.localeCompare(nameB, 'zh-CN', { numeric: true, sensitivity: 'base' });
                }

                if (sortOrder === 'desc') res = -res;
            } else if (sortBy === 'created') {
                const timeA = new Date(a.created_at).getTime() || 0;
                const timeB = new Date(b.created_at).getTime() || 0;
                res = timeA - timeB;
                if (sortOrder === 'desc') res = timeB - timeA;
            } else if (sortBy === 'played') {
                const timeA = groupMaxPlayed.get(a.id) || 0;
                const timeB = groupMaxPlayed.get(b.id) || 0;
                res = timeA - timeB;
                if (sortOrder === 'desc') res = timeB - timeA;
            }
            return res;
        });

        return sortedFolders.map(f => ({
            folder: f,
            videos: groups.get(f.id) || []
        })).filter(g => g.videos.length > 0);
    }, [sortedVideos, videoFolders, sortBy, sortOrder]);


    const handleTabChange = (tab: 'all' | 'folders') => {
        setTab(tab);
    };

    const getSortLabel = () => {
        if (sortBy === 'name') return '名称';
        if (sortBy === 'created') return '添加日期';
        if (sortBy === 'played') return '播放日期';
        return '排序';
    };

    return (
        <PageContainer
            title="视频"
            actions={
                <div className="flex items-center gap-4">
                    {scanning && progress && (
                        <div className="flex items-center gap-2 text-xs text-on-surface-variant animate-fade-in bg-surface-container-high px-3 py-1.5 rounded-full">
                            <div className="w-20 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${(progress.processed / progress.total) * 100}%` }}
                                />
                            </div>
                            <span className="tabular-nums">{progress.processed}/{progress.total}</span>
                        </div>
                    )}
                    <LibraryHeaderButton onClick={handleAddFolder} />
                </div>
            }
        >
            <div className="h-full flex flex-col animate-fade-in">
                {/* Tabs and Sort */}
                <div className="flex items-center justify-between border-b border-outline-variant/20 mb-6 px-1">
                    <div className="flex items-center gap-8">
                        <button
                            onClick={() => handleTabChange('all')}
                            className={clsx(
                                "pb-3 text-sm font-medium transition-all relative",
                                activeTab === 'all'
                                    ? "text-primary"
                                    : "text-on-surface-variant hover:text-on-surface"
                            )}
                        >
                            所有视频 ({videos.length})
                            {activeTab === 'all' && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"
                                />
                            )}
                        </button>
                        <button
                            onClick={() => handleTabChange('folders')}
                            className={clsx(
                                "pb-3 text-sm font-medium transition-all relative",
                                activeTab === 'folders'
                                    ? "text-primary"
                                    : "text-on-surface-variant hover:text-on-surface"
                            )}
                        >
                            视频文件夹
                            {activeTab === 'folders' && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"
                                />
                            )}
                        </button>
                    </div>

                    {/* Sort Menu */}
                    <Menu as="div" className="relative mb-3">
                        <MenuButton className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
                            <MdSort className="text-lg" />
                            {getSortLabel()}
                        </MenuButton>
                        <MenuItems
                            anchor="bottom end"
                            className="w-40 origin-top-right rounded-xl border border-neutral-200/50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-1 text-sm text-neutral-900 shadow-2xl ring-1 ring-black/5 focus:outline-none dark:border-neutral-700/50 dark:text-white z-50 mt-2"
                        >
                            <MenuItem>
                                <button onClick={() => { setSortBy('played'); setSortOrder('desc'); }} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                    最近播放
                                    {sortBy === 'played' && <MdCheck />}
                                </button>
                            </MenuItem>
                            <MenuItem>
                                <button onClick={() => { setSortBy('created'); setSortOrder('desc'); }} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                    最近添加
                                    {sortBy === 'created' && <MdCheck />}
                                </button>
                            </MenuItem>
                            <MenuItem>
                                <button onClick={() => { setSortBy('name'); setSortOrder('asc'); }} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                    名称
                                    {sortBy === 'name' && <MdCheck />}
                                </button>
                            </MenuItem>
                        </MenuItems>
                    </Menu>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden min-h-0">
                    <AnimatePresence mode="wait">
                        {activeTab === 'all' ? (
                            <motion.div
                                key="all"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ duration: 0.2 }}
                                className="h-full"
                            >
                                <VideoGrid videos={sortedVideos} playSingleItem={true} virtualized={true} />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="folders"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2 }}
                                className="h-full"
                            >
                                {groupedVideos.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center opacity-50">
                                        <p className="text-lg">
                                            {foldersRefreshing ? '加载视频文件夹中...' : '没有视频文件夹'}
                                        </p>
                                    </div>
                                ) : scrollParent ? (
                                    <Virtuoso
                                        useWindowScroll={false}
                                        customScrollParent={scrollParent}
                                        data={groupedVideos}
                                        className="w-full h-full"
                                        itemContent={(_, { folder, videos }) => {
                                            const isCollapsed = collapsedFolderIds.includes(folder.id);
                                            const allSelected = videos.length > 0 && videos.every(v => selectedIds.has(v.path));

                                            return (
                                                <div className="flex flex-col gap-3 pt-5 pb-2 px-2 first:pt-0">
                                                    {/* Folder Header */}
                                                    <div className="flex items-center justify-between text-on-surface pb-2 border-b border-outline-variant/10 group/header">
                                                        <div
                                                            className="flex items-center gap-3 overflow-hidden cursor-pointer select-none"
                                                            onClick={() => toggleFolderCollapse(folder.id)}
                                                        >
                                                            <div className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors">
                                                                {isCollapsed ? <MdExpandMore className="text-2xl text-on-surface-variant" /> : <MdExpandLess className="text-2xl text-on-surface-variant" />}
                                                            </div>
                                                            <MdFolder className="text-2xl text-on-surface-variant" />
                                                            <div className="flex items-baseline gap-3 overflow-hidden">
                                                                <h2 className="text-xl font-semibold truncate">
                                                                    {folder.path.split(/[/\\]/).pop()}
                                                                </h2>
                                                                <span className="text-sm text-on-surface-variant/60 truncate font-mono">
                                                                    {folder.path}
                                                                </span>
                                                            </div>
                                                            <span className="text-sm text-on-surface-variant/50 ml-2">
                                                                ({videos.length}个视频)
                                                            </span>
                                                        </div>

                                                        {isSelectionMode && (
                                                            <button
                                                                onClick={() => handleSelectFolder(videos, allSelected)}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-surface-container-high transition-colors text-primary"
                                                            >
                                                                {allSelected ? <MdCheckBox className="text-lg" /> : <MdCheckBoxOutlineBlank className="text-lg" />}
                                                                <span>全选</span>
                                                            </button>
                                                        )}
                                                    </div>

                                                    <AnimatePresence initial={false}>
                                                        {!isCollapsed && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="pl-2 overflow-hidden"
                                                            >
                                                                <VideoGrid videos={videos} virtualized={false} />
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        }}
                                        components={{
                                            Footer: () => <div className="h-20" />
                                        }}
                                    />
                                ) : (
                                    <div className="h-full flex flex-col opacity-0" />
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </PageContainer>
    );
};

const VideoGrid: React.FC<{ videos: VideoMetadata[]; playSingleItem?: boolean; virtualized?: boolean }> = ({ videos, playSingleItem, virtualized = false }) => {
    const { setVideoMode, setIsPlaying, setVideoMetadata, setVideoQueue } = usePlayerStore();
    const { isSelectionMode, toggleSelection, toggleSelectionMode, selectedIds } = useSelectionStore();
    const { openProperties } = useDialogStore();
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; video: VideoMetadata } | null>(null);

    if (videos.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center opacity-50 p-10">
                <span className="text-sm">此文件夹为空</span>
            </div>
        );
    }

    const handlePlayVideo = async (video: VideoMetadata) => {
        if (isSelectionMode) return;
        let queue: SongMetadata[];
        let index: number;

        if (playSingleItem) {
            queue = [{
                id: video.id,
                title: video.title,
                artist: "视频",
                album: video.folder_id ? "文件夹" : "未知",
                duration: video.duration,
                path: video.path,
                cover_path: video.thumbnail_path,
            }];
            index = 0;
        } else {
            queue = videos.map(v => ({
                id: v.id,
                title: v.title,
                artist: "视频",
                album: v.folder_id ? "文件夹" : "未知",
                duration: v.duration,
                path: v.path,
                cover_path: v.thumbnail_path,
            }));
            index = videos.findIndex(v => v.id === video.id);
            if (index < 0) index = 0;
        }

        setVideoQueue(queue, index);
        setVideoMetadata(queue[index]);
        setVideoMode(true);
        if (usePlayerStore.getState().isPlaying) {
            await audioService.pause();
            setIsPlaying(false);
        }

        useLibraryStore.getState().addToRecent({
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

    const handleContextMenu = (e: React.MouseEvent, video: VideoMetadata) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, video });
    };

    const handleShowProperties = (video: VideoMetadata) => {
        const songMeta: SongMetadata = {
            id: video.id,
            title: video.title,
            artist: "视频",
            album: video.folder_id ? "文件夹" : "未知",
            duration: video.duration,
            path: video.path,
            cover_path: video.thumbnail_path,
            width: video.width,
            height: video.height,
            frame_rate: video.frame_rate,
            channels: video.channels,
            size: video.size,
        };
        openProperties(songMeta);
    };

    const handleToggleSelection = (id: string, type: 'video', data: VideoMetadata) => {
        if (isSelectionMode) {
            toggleSelection(id, type, data);
        } else {
            toggleSelectionMode({ id, type, data });
        }
    };

    if (virtualized) {
        return (
            <>
                <VirtualizedGrid
                    data={videos}
                    itemKey={(_index, video) => getMusicItemId(video)}
                    listClassName="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4 pb-20"
                    overscan={200}
                    itemContent={(_, video) => {
                        const id = getMusicItemId(video);
                        return (
                            <VideoCard
                                video={video}
                                isSelected={selectedIds.has(id)}
                                isSelectionMode={isSelectionMode}
                                onPlay={handlePlayVideo}
                                onToggleSelection={handleToggleSelection}
                                onContextMenu={handleContextMenu}
                                onShowProperties={handleShowProperties}
                            />
                        );
                    }}
                />
                {contextMenu && (
                    <SmartCursorContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        item={contextMenu.video}
                        context="video"
                        onClose={() => setContextMenu(null)}
                        onPlay={() => handlePlayVideo(contextMenu.video)}
                        onShowProperties={() => handleShowProperties(contextMenu.video)}
                    />
                )}
            </>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {videos.map((video) => {
                const id = getMusicItemId(video);
                return (
                    <VideoCard
                        key={video.id}
                        video={video}
                        isSelected={selectedIds.has(id)}
                        isSelectionMode={isSelectionMode}
                        onPlay={handlePlayVideo}
                        onToggleSelection={handleToggleSelection}
                        onContextMenu={handleContextMenu}
                        onShowProperties={handleShowProperties}
                    />
                );
            })}

            {contextMenu && (
                <SmartCursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    item={contextMenu.video}
                    context="video"
                    onClose={() => setContextMenu(null)}
                    onPlay={() => handlePlayVideo(contextMenu.video)}
                    onShowProperties={() => handleShowProperties(contextMenu.video)}
                />
            )}
        </div>
    );
};
