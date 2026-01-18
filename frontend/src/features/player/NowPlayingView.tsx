import clsx from 'clsx';
import { IoMusicalNotes } from 'react-icons/io5';
import type { SongMetadata } from '../../types';

interface NowPlayingViewProps {
    metadata: SongMetadata | null;
}

export default function NowPlayingView({ metadata }: NowPlayingViewProps) {
    const hasCover = !!metadata?.cover;

    return (
        // 修改点：去掉了 bg-white/50 中的 /50，改为纯色 bg-white
        // 同时也确认暗色模式是实心的 dark:bg-[#121212]
        <div className="relative flex-1 w-full h-full overflow-hidden bg-white dark:bg-[#121212]">

            {/* 顶部拖动区域 (保持不变) */}
            <div
                data-tauri-drag-region
                className="absolute top-0 left-0 right-0 h-14 z-50"
            />

            {/* 背景层 */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                {hasCover ? (
                    <div className="absolute inset-0 scale-105">
                        {/* 这里的逻辑是：
                底层是实心的 bg-white/bg-[#121212] (父容器)
                上面盖一张图片，图片本身有 opacity-60。
                
                结果：用户看到的是 60% 的图片 + 40% 的实心背景色混合。
                因为底层是实心的，所以侧边栏再也不会透出来了。
             */}
                        <img
                            src={metadata!.cover!}
                            alt="Background"
                            className="w-full h-full object-cover blur-[60px] opacity-60 dark:opacity-40 transition-all duration-700"
                        />
                        {/* 渐变遮罩保持不变 */}
                        <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-transparent to-white/30 dark:from-[#121212] dark:via-transparent dark:to-black/20" />
                    </div>
                ) : (
                    <div className="w-full h-full bg-neutral-100 dark:bg-[#1c1c1c]" />
                )}
            </div>

            {/* 内容层 (保持不变) */}
            <div className="absolute inset-0 z-10 flex items-end p-8 pb-12 sm:p-12 sm:pb-16">
                <div className="relative group animate-in fade-in slide-in-from-bottom-12 zoom-in-95 duration-700 ease-out">
                    <div className={clsx(
                        "relative aspect-square rounded-lg shadow-2xl overflow-hidden",
                        "w-48 sm:w-64 md:w-80 lg:w-96",
                        "bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center"
                    )}>
                        {hasCover ? (
                            <img src={metadata!.cover!} alt="Album Art" className="w-full h-full object-cover" />
                        ) : (
                            <IoMusicalNotes className="text-6xl text-neutral-400" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}