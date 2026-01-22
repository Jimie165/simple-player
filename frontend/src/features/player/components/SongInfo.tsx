import clsx from 'clsx';
// IoMusicalNotes removed, used inside CoverImage
import { IoHeart } from 'react-icons/io5';
import { useLibraryStore } from '../../../store/useLibraryStore'; // Add this
import type { SongMetadata } from '../../../types';
import CoverImage from '../../../components/common/CoverImage';

interface SongInfoProps {
    metadata: SongMetadata | null;
    isFullScreen: boolean;
    toggleFullScreen: () => void;
}

export default function SongInfo({ metadata, isFullScreen, toggleFullScreen }: SongInfoProps) {
    const { toggleFavorite } = useLibraryStore();

    return (
        <div className="w-[30%] min-w-0 flex justify-start">
            <button
                onClick={toggleFullScreen}
                className="group flex items-center text-left rounded-lg p-2 -ml-2 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors relative overflow-visible w-auto max-w-full"
            >
                <div className={clsx(
                    "relative shrink-0 flex items-center justify-center bg-neutral-200 dark:bg-neutral-700 overflow-hidden shadow-sm transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
                    isFullScreen
                        ? "w-0 h-14 opacity-0 -translate-y-12 scale-150 mr-0"
                        : "w-14 h-14 opacity-100 translate-y-0 scale-100 mr-4 rounded-md"
                )}>
                    <CoverImage
                        song={metadata}
                        className="w-full h-full object-cover"
                        iconClassName="text-2xl text-neutral-400"
                    />
                </div>

                <div className="min-w-0 flex-1 flex flex-col justify-center transition-all duration-500 pr-4">
                    <div className="font-semibold text-sm truncate text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors w-full flex items-center gap-2">
                        <span>{metadata?.title || "未播放音乐"}</span>
                        {metadata?.is_favorite && <IoHeart className="text-red-500 text-xs shrink-0" />}
                    </div>
                    <div className="text-xs text-neutral-500 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors truncate w-full mt-0.5">
                        {metadata?.artist || "Simple Player"}
                    </div>
                </div>
            </button>
        </div>
    );
}