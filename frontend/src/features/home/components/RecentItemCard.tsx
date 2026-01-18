import { IoPlay, IoFolderOpen, IoMusicalNotes } from 'react-icons/io5';
import type { RecentItem } from '../../../types';

interface RecentItemCardProps {
    item: RecentItem;
    onClick: () => void;
}

export default function RecentItemCard({ item, onClick }: RecentItemCardProps) {
    return (
        <div
            onClick={onClick}
            className="group flex flex-col gap-3 rounded-xl p-3 -mx-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer"
        >
            <div className="aspect-square w-full rounded-lg shadow-sm bg-neutral-200 dark:bg-neutral-800 group-hover:shadow-md group-hover:scale-[1.02] transition-all duration-300 relative overflow-hidden flex items-center justify-center">
                {item.cover ? (
                    <img src={item.cover} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                    item.type === 'folder'
                        ? <IoFolderOpen className="text-5xl text-blue-400" />
                        : <IoMusicalNotes className="text-5xl text-neutral-400" />
                )}

                {/* 播放遮罩 */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/10">
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg text-white translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                        <IoPlay className="ml-1" />
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {item.title}
                </span>
                <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {item.description}
                </span>
            </div>
        </div>
    );
}