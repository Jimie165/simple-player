import clsx from 'clsx';
import type { SongMetadata } from '../types';
import { IoMusicalNotes } from 'react-icons/io5';

interface NowPlayingViewProps {
    metadata: SongMetadata | null;
}

export default function NowPlayingView({ metadata }: NowPlayingViewProps) {
    const hasCover = !!metadata?.cover;

    return (
        <div className="relative flex-1 w-full h-full overflow-hidden bg-white/50 dark:bg-[#121212]">

            {/* 1. 背景层：降低模糊度 */}
            <div className="absolute inset-0 z-0 overflow-hidden">
                {hasCover ? (
                    <div className="absolute inset-0 scale-105">
                        <img
                            src={metadata!.cover!}
                            alt="Background"
                            // 修改：blur-[100px] -> blur-[60px]，稍微清晰一点点
                            className="w-full h-full object-cover blur-[40px] opacity-60 dark:opacity-40 transition-all duration-700"
                        />
                        {/* 渐变遮罩保持不变 */}
                        <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-white/10 dark:from-[#121212] dark:via-[#121212]/40 dark:to-black/10" />
                    </div>
                ) : (
                    <div className="w-full h-full bg-neutral-100 dark:bg-[#1c1c1c]" />
                )}
            </div>

            {/* 2. 内容层 */}
            {/* 修改：增加 slide-in-from-bottom-20，模拟从下方升起的动画 */}
            <div className="absolute inset-0 z-10 flex items-end p-8 pb-12 sm:p-12 sm:pb-16 animate-in fade-in slide-in-from-bottom-20 duration-700 ease-[cubic-bezier(0.2,0,0,1)]">
                <div className="relative group">
                    {/* 封面容器 */}
                    <div className={clsx(
                        "relative aspect-square rounded-xl shadow-2xl overflow-hidden transition-all duration-500",
                        "w-48 sm:w-64 md:w-80 lg:w-96", // 尺寸
                        "bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center ring-1 ring-white/10"
                    )}>
                        {hasCover ? (
                            <img
                                src={metadata!.cover!}
                                alt="Album Art"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <IoMusicalNotes className="text-6xl text-neutral-400" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}