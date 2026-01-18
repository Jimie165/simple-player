import clsx from 'clsx';
import { IoMusicalNotes, IoPlay } from 'react-icons/io5';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { usePlayerStore } from '../../../store/usePlayerStore';
import { audioService } from '../../../services/audioService';
import type { SongMetadata } from '../../../types'; // 引入类型

interface PlayQueuePopupProps {
    show: boolean;
}

export default function PlayQueuePopup({ show }: PlayQueuePopupProps) {
    // playlist 现在是 SongMetadata[] 类型
    const { playlist, currentSongIndex, setCurrentSongIndex } = useLibraryStore();
    const { setMetadata, setIsPlaying } = usePlayerStore();

    const handlePlay = async (song: SongMetadata, index: number) => {
        if (!song.path) return;
        setCurrentSongIndex(index);
        try {
            setMetadata(song);
            await audioService.play(song.path, song);
            setIsPlaying(true);
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className={clsx(
            "absolute bottom-full right-0 mb-4 w-80 max-h-96 rounded-2xl shadow-xl border overflow-hidden flex flex-col",
            "bg-white/95 dark:bg-[#2d2d2d]/95 backdrop-blur-md border-neutral-200 dark:border-neutral-700",
            "transition-all duration-200 origin-bottom-right z-[60]",
            show ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
        )}>
            {/* 标题 */}
            <div className="p-4 border-b border-neutral-200/50 dark:border-neutral-700/50 bg-neutral-50/50 dark:bg-white/5">
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">播放队列</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    共 {playlist.length} 首歌曲
                </p>
            </div>

            {/* 列表 */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
                {playlist.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-neutral-400 text-xs">
                        <IoMusicalNotes className="text-3xl mb-2 opacity-20" />
                        <span>队列为空</span>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {playlist.map((song, index) => {
                            const isCurrent = index === currentSongIndex;
                            return (
                                <div
                                    key={index}
                                    onDoubleClick={() => handlePlay(song, index)}
                                    className={clsx(
                                        "group flex items-center gap-3 p-2 rounded-lg text-xs cursor-default transition-colors",
                                        isCurrent
                                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                            : "hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-200"
                                    )}
                                >
                                    <div className="w-5 text-center shrink-0 font-medium opacity-60">
                                        {isCurrent ? <IoPlay /> : index + 1}
                                    </div>

                                    <div className="flex-1 flex flex-col min-w-0">
                                        {/* 显示标题 */}
                                        <span className="truncate font-medium">{song.title || "Unknown Title"}</span>
                                        {/* 显示艺人 */}
                                        <span className="truncate text-[10px] opacity-70">{song.artist || "Unknown Artist"}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}