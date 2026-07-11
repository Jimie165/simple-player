import { motion, AnimatePresence } from 'framer-motion';
import { MdClose } from 'react-icons/md';

import CoverImage from '@/components/common/CoverImage';
import { formatTime } from '@/utils/time';
import type { SongMetadata } from '@/types';

export function VideoPlaylistDrawer({
    isOpen,
    onClose,
    videoQueue,
    currentVideoIndex,
    onSelectVideo,
}: {
    isOpen: boolean;
    onClose: () => void;
    videoQueue: SongMetadata[];
    currentVideoIndex: number;
    onSelectVideo: (index: number) => void;
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-60"
                    onClick={onClose}
                    key="video-drawer-backdrop"
                />
            )}

            {isOpen && (
                <motion.div
                    key="video-drawer-panel"
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="absolute top-0 right-0 h-full w-80 bg-black/80 backdrop-blur-xl border-l border-white/10 z-70 flex flex-col shadow-2xl pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-4 border-b border-white/10">
                        <h2 className="text-white font-medium text-lg">播放列表</h2>
                        <button
                            onClick={onClose}
                            className="p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                        >
                            <MdClose className="text-xl" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                        {videoQueue.map((video, index) => (
                            <div
                                key={video.id + '_' + index}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectVideo(index);
                                }}
                                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors group/item ${index === currentVideoIndex
                                    ? 'bg-primary/20 hover:bg-primary/30'
                                    : 'hover:bg-white/5'
                                    }`}
                            >
                                <div className="w-16 aspect-video bg-black/40 rounded overflow-hidden shrink-0 relative">
                                    <CoverImage
                                        song={video}
                                        src={video.cover_path}
                                        className="w-full h-full object-cover"
                                        iconClassName="text-white/30"
                                    />
                                    {index === currentVideoIndex && (
                                        <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                                            <div className="w-2 h-2 bg-primary animate-pulse rounded-full" />
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className={`text-sm font-medium truncate ${index === currentVideoIndex ? 'text-primary' : 'text-white/90'}`}>
                                        {video.title}
                                    </div>
                                    <div className="text-xs text-white/50 truncate">
                                        {formatTime(video.duration)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
