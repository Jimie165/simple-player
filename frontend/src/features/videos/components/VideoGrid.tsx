import React, { useState } from 'react';

import type { VideoMetadata, SongMetadata } from '@/types';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { useDialogStore } from '@/store/useDialogStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { audioService } from '@/services/audioService';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import { getMusicItemId } from '@/utils/musicItemUtils';
import { formatTime } from '@/utils/time';
import VirtualizedGrid from '@/components/common/VirtualizedGrid';
import { VideoCard } from '@/features/videos/components/VideoCard';
import { useMainContentWidth } from '@/hooks/useMainContentWidth';
import { getSparseGridStyle } from '@/utils/gridLayout';

export const VideoGrid: React.FC<{ videos: VideoMetadata[]; playSingleItem?: boolean; virtualized?: boolean }> = ({ videos, playSingleItem, virtualized = false }) => {
    const mainContentWidth = useMainContentWidth();
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
                    listClassName="grid content-grid-video gap-4 p-4 pb-20"
                    listStyle={getSparseGridStyle(mainContentWidth, videos.length, 16, 'video')}
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
        <div
            className="grid content-grid-video gap-4"
            style={getSparseGridStyle(mainContentWidth, videos.length, 16, 'video')}
        >
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
