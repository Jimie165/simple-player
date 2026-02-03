import React, { useEffect, useState, useMemo } from 'react';
import { useVideoStore } from '@/store/useVideoStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import clsx from 'clsx';
import { open } from '@tauri-apps/plugin-dialog';
import { libraryService } from '@/services/libraryService';
import LibraryHeaderButton from '@/features/library/components/LibraryHeaderButton';
import { AnimatePresence, motion } from 'framer-motion';
import PageContainer from '@/components/layout/PageContainer';
import type { LibraryFolder, VideoMetadata, SongMetadata } from '@/types';
import { MdPlayArrow, MdFolder, MdCheckBox, MdCheckBoxOutlineBlank } from 'react-icons/md';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { useDialogStore } from '@/store/useDialogStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { audioService } from '@/services/audioService';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import CardPlayButton from '@/components/common/CardPlayButton';
import { getMusicItemId } from '@/utils/musicItemUtils';
import { formatTime } from '@/utils/time';

export const VideoLibrary: React.FC = () => {
    const { videos, fetchVideos } = useVideoStore();
    const { currentTab, currentPage, lastVideoTab, setTab } = useNavigationStore();
    const { isSelectionMode, selectAllRequested, setSelectAllRequested, selectAll, selectionType, setSelectableIds } = useSelectionStore();
    const [folders, setFolders] = useState<LibraryFolder[]>([]);

    // Use currentTab if we are on the page, otherwise fall back to lastVideoTab to prevent switch animation during exit
    const effectiveTab = currentPage === 'videos' ? currentTab : (lastVideoTab || 'all');
    const activeTab = effectiveTab === 'folders' ? 'folders' : 'all';

    // Ref to track if we are unmounting/switching pages
    const isVisibleRef = React.useRef(true);
    useEffect(() => {
        isVisibleRef.current = true;
        return () => { isVisibleRef.current = false; };
    }, []);

    // ... existing effect code ...
    useEffect(() => {
        if (selectAllRequested && isSelectionMode && (selectionType === 'video' || !selectionType)) {
            const items = videos.map(v => ({
                id: v.path, // Path is used as ID for videos
                data: v
            }));
            selectAll(items, 'video');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, videos, selectAll, setSelectAllRequested, selectionType]);

    useEffect(() => {
        if (!isSelectionMode) return;
        setSelectableIds(videos.map(v => v.path));
    }, [isSelectionMode, videos, setSelectableIds]);

    useEffect(() => {
        fetchVideos();
        // Fetch video library folders only
        libraryService.getVideoFolders().then(setFolders).catch(console.error);
    }, [fetchVideos]);

    const handleAddFolder = async () => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
                // 只添加这一个文件夹，backend会自动扫描并只恢复该文件夹内的视频
                await libraryService.addVideoFolder(selected);
                // 重新获取视频列表和文件夹列表以实时更新界面
                await fetchVideos();
                const updatedFolders = await libraryService.getVideoFolders();
                setFolders(updatedFolders);
            }
        } catch (err) {
            console.error('添加视频文件夹失败:', err);
        }
    };

    // Group videos by folder
    const groupedVideos = useMemo(() => {
        const groups = new Map<number, VideoMetadata[]>();
        const unmatched: VideoMetadata[] = [];

        videos.forEach(v => {
            if (v.folder_id) {
                if (!groups.has(v.folder_id)) groups.set(v.folder_id, []);
                groups.get(v.folder_id)!.push(v);
            } else {
                unmatched.push(v);
            }
        });

        // Create display groups based on known folders
        const result = folders.map(f => ({
            folder: f,
            videos: groups.get(f.id) || []
        })).filter(g => g.videos.length > 0);

        return result;
    }, [videos, folders]);


    const handleTabChange = (tab: 'all' | 'folders') => {
        setTab(tab);
    };

    return (
        <PageContainer
            title="视频"
            actions={<LibraryHeaderButton onClick={handleAddFolder} />}
        >
            <div className="h-full flex flex-col animate-fade-in">
                {/* Tabs */}
                <div className="flex items-center gap-8 px-1 border-b border-outline-variant/20 mb-6">
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

                {/* Content */}
                <div className="flex-1 overflow-y-auto min-h-0">
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
                                <VideoGrid videos={videos} playSingleItem={true} />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="folders"
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.2 }}
                                className="h-full flex flex-col gap-3 pb-8"
                            >
                                {groupedVideos.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center opacity-50">
                                        <p className="text-lg">没有视频文件夹</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center">
                                            <button className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-full hover:bg-primary/90 transition-all font-medium shadow-lg hover:shadow-xl active:scale-95">
                                                <MdPlayArrow className="text-2xl" />
                                                播放
                                            </button>
                                        </div>

                                        {groupedVideos.map(({ folder, videos }) => (
                                            <div key={folder.id} className="flex flex-col gap-3 pt-5 first:pt-0">
                                                {/* Folder Header */}
                                                <div className="flex items-center gap-3 text-on-surface pb-2 border-b border-outline-variant/10">
                                                    <MdFolder className="text-2xl text-on-surface-variant" />
                                                    <div className="flex items-baseline gap-3 overflow-hidden">
                                                        {/* Folder Name - deduced from path */}
                                                        <h2 className="text-xl font-semibold truncate">
                                                            {folder.path.split(/[/\\]/).pop()}
                                                        </h2>
                                                        <span className="text-sm text-on-surface-variant/60 truncate font-mono">
                                                            {folder.path}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Videos in this folder */}
                                                <div className="pl-2">
                                                    <VideoGrid videos={videos} />
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </PageContainer>
    );
};



// ... imports
import CoverImage from '@/components/common/CoverImage';

// ... existing code ...

const VideoGrid: React.FC<{ videos: VideoMetadata[]; playSingleItem?: boolean }> = ({ videos, playSingleItem }) => {
    // ... existing hook calls
    const { setVideoMode, setIsPlaying, setVideoMetadata, setVideoQueue } = usePlayerStore();
    const { isSelectionMode, toggleSelection, selectedIds, toggleSelectionMode } = useSelectionStore();
    const { openProperties } = useDialogStore();
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; video: VideoMetadata } | null>(null);

    if (videos.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center opacity-50">
                <span className="text-sm">此文件夹为空</span>
            </div>
        );
    }

    const handlePlayVideo = async (video: VideoMetadata) => {
        // ... (keep implementation same)
        if (isSelectionMode) return;
        let queue: SongMetadata[];
        let index: number;

        if (playSingleItem) {
            queue = [{
                id: video.id,
                title: video.title,
                artist: "Video",
                album: video.folder_id ? "Folder" : "Unknown",
                duration: video.duration,
                path: video.path,
                cover_path: video.thumbnail_path,
            }];
            index = 0;
        } else {
            queue = videos.map(v => ({
                id: v.id,
                title: v.title,
                artist: "Video",
                album: v.folder_id ? "Folder" : "Unknown",
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
            artist: "Video",
            album: video.folder_id ? "Folder" : undefined,
            isLibraryItem: true
        });
    };

    const handleContextMenu = (e: React.MouseEvent, video: VideoMetadata) => {
        e.preventDefault();
        const clickEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: e.clientX,
            clientY: e.clientY
        });
        Object.defineProperty(clickEvent, 'target', { writable: false, value: e.currentTarget });
        document.dispatchEvent(clickEvent);
        setContextMenu({ x: e.clientX, y: e.clientY, video });
    };

    const handleItemClick = (video: VideoMetadata, e: React.MouseEvent) => {
        if (isSelectionMode) {
            e.stopPropagation();
            toggleSelection(video.path, 'video', video);
            return;
        }
        handlePlayVideo(video);
    };

    const handleShowProperties = (video: VideoMetadata) => {
        const songMeta: SongMetadata = {
            id: video.id,
            title: video.title,
            artist: "Video",
            album: video.folder_id ? "Folder" : "Unknown",
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

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {videos.map((video) => {
                const id = getMusicItemId(video);
                const isSelected = selectedIds.has(id);
                return (
                    <div
                        key={video.id}
                        onClick={(e) => handleItemClick(video, e)}
                        onContextMenu={(e) => handleContextMenu(e, video)}
                        className={clsx(
                            "group relative flex flex-col gap-2 p-2 rounded-xl transition-all cursor-pointer",
                            isSelected
                                ? "bg-primary/10 hover:bg-primary/20"
                                : "hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                    >
                        {/* Thumbnail */}
                        <div className="aspect-video bg-surface-container-highest rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-all relative">
                            <CoverImage
                                src={video.thumbnail_path}
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />

                            {/* Selection Checkbox */}
                            {isSelectionMode && (
                                <div className="absolute top-2 left-2 z-20">
                                    <div
                                        onClick={(e) => { e.stopPropagation(); toggleSelection(id, 'video', video); }}
                                        className="w-6 h-6 rounded bg-white/40 backdrop-blur-sm flex items-center justify-center hover:bg-white/60 transition-colors"
                                    >
                                        {isSelected
                                            ? <MdCheckBox className="text-primary text-xl" />
                                            : <MdCheckBoxOutlineBlank className="text-neutral-700 text-xl" />
                                        }
                                    </div>
                                </div>
                            )}

                            {/* Play Overlay & Context Menu Trigger */}
                            {!isSelectionMode && (
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CardPlayButton onClick={() => handlePlayVideo(video)} title="播放视频" />

                                    <SmartMusicContextMenu
                                        className="absolute bottom-3 right-3"
                                        buttonClassName="w-10 h-10"
                                        items={video}
                                        context="video"
                                        onPlay={() => handlePlayVideo(video)}
                                        onSelect={() => toggleSelectionMode({ id, type: 'video', data: video })}
                                        onShowProperties={() => handleShowProperties(video)}
                                    />
                                </div>
                            )}

                            {/* Duration Badge */}
                            {video.duration > 0 && (
                                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] text-white font-medium z-10">
                                    {formatTime(video.duration)}
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex flex-col gap-0.5 px-1 text-center">
                            <h3 className="font-medium truncate text-sm" title={video.title}>{video.title}</h3>
                            <p className="text-xs opacity-60 truncate">
                                {formatTime(video.duration)}
                            </p>
                        </div>
                    </div>
                );
            })}

            {/* Cursor Context Menu */}
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
}
