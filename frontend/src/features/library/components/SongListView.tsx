import { MdAccessTime, MdPlayArrow } from 'react-icons/md';
import { IoMusicalNotes } from 'react-icons/io5';
import type { SongMetadata } from '../../../types';

interface SongListViewProps {
    songs: SongMetadata[];
    onPlay: (song: SongMetadata, index: number) => void;
}

export default function SongListView({ songs, onPlay }: SongListViewProps) {
    // 简单的时长格式化辅助 (如果后端没传格式化好的字符串)
    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="w-full relative">
            {/* 表头 */}
            <div className="sticky top-0 z-10 grid grid-cols-[auto_4fr_3fr_3fr_1fr] gap-4 py-3 -mx-8 px-8 border-b border-neutral-200/50 dark:border-neutral-800/50 text-xs font-medium text-neutral-500 uppercase tracking-wider bg-white/85 dark:bg-[#272727]/85 backdrop-blur-md transition-colors">
                <div className="w-8 text-center">#</div>
                <div>标题</div>
                <div>艺人</div>
                <div>专辑</div>
                <div className="text-right pr-4"><MdAccessTime className="inline text-base" /></div>
            </div>

            {/* 列表内容 */}
            <div className="flex flex-col pt-2">
                {songs.map((song, index) => (
                    <div
                        key={song.path || index}
                        onDoubleClick={() => onPlay(song, index)}
                        className="group grid grid-cols-[auto_4fr_3fr_3fr_1fr] gap-4 px-4 py-2.5 items-center hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-default"
                    >
                        <div className="w-8 text-center text-sm text-neutral-400 group-hover:text-transparent relative">
                            <span className="group-hover:hidden">{index + 1}</span>
                            <button
                                onClick={(e) => {
                                    // 阻止冒泡，防止触发潜在的行点击事件
                                    e.stopPropagation();
                                    onPlay(song, index);
                                }}
                                className="absolute inset-0 hidden group-hover:flex items-center justify-center text-blue-600 dark:text-blue-400"
                            >
                                <MdPlayArrow className="text-xl" />
                            </button>
                        </div>

                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-8 h-8 rounded-md shrink-0 bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                                {song.cover ? (
                                    <img src={song.cover} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                        <IoMusicalNotes />
                                    </div>
                                )}
                            </div>
                            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                {song.title}
                            </span>
                        </div>

                        <div className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
                            {song.artist}
                        </div>

                        <div className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
                            {song.album}
                        </div>

                        <div className="text-sm text-neutral-500 dark:text-neutral-400 text-right pr-4 font-variant-numeric">
                            {formatDuration(song.duration)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}