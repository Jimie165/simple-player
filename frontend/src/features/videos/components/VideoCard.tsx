import React from 'react';
import clsx from 'clsx';
import { MdCheckBox, MdCheckBoxOutlineBlank } from 'react-icons/md';
import type { VideoMetadata } from '@/types';
import { formatTime } from '@/utils/time';
import { getMusicItemId } from '@/utils/musicItemUtils';
import CoverImage from '@/components/common/CoverImage';
import CardPlayButton from '@/components/common/CardPlayButton';
import CustomTooltip from '@/components/common/CustomTooltip';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';

interface VideoCardProps {
    video: VideoMetadata;
    isSelected: boolean;
    isSelectionMode: boolean;
    onPlay: (video: VideoMetadata) => void;
    onToggleSelection: (id: string, type: 'video', data: VideoMetadata) => void;
    onContextMenu: (e: React.MouseEvent, video: VideoMetadata) => void;
    onShowProperties: (video: VideoMetadata) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
    video,
    isSelected,
    isSelectionMode,
    onPlay,
    onToggleSelection,
    onContextMenu,
    onShowProperties
}) => {
    const id = getMusicItemId(video);

    const handleItemClick = (e: React.MouseEvent) => {
        if (isSelectionMode) {
            e.stopPropagation();
            onToggleSelection(video.path, 'video', video);
            return;
        }
        if (video.duration === 0) return; // Disable play for invalid duration
        onPlay(video);
    };

    return (
        <div
            onClick={handleItemClick}
            onContextMenu={(e) => onContextMenu(e, video)}
            className={clsx(
                "group relative flex flex-col gap-2 p-2 rounded-xl transition-all cursor-pointer h-full",
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
                            onClick={(e) => { e.stopPropagation(); onToggleSelection(id, 'video', video); }}
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
                {!isSelectionMode && video.duration > 0 && (
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <CardPlayButton onClick={() => onPlay(video)} title="播放视频" />

                        <SmartMusicContextMenu
                            className="absolute bottom-3 right-3"
                            buttonClassName="w-10 h-10"
                            items={video}
                            context="video"
                            onPlay={() => onPlay(video)}
                            onSelect={() => onToggleSelection(id, 'video', video)}
                            onShowProperties={() => onShowProperties(video)}
                        />
                    </div>
                )}

                {/* Duration Badge */}
                {video.duration > 0 ? (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] text-white font-medium z-10">
                        {formatTime(video.duration)}
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-lg">
                        <span className="text-white text-[10px] font-medium px-2 py-1 bg-black/50 rounded-full animate-pulse border border-white/10">
                            扫描中...
                        </span>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex flex-col gap-0.5 px-1 text-center">
                <CustomTooltip text={video.title} className="block min-w-0">
                    <h3 className="font-medium truncate text-sm">{video.title}</h3>
                </CustomTooltip>
                <p className="text-xs opacity-60 truncate">
                    {formatTime(video.duration)}
                </p>
            </div>
        </div>
    );
};
