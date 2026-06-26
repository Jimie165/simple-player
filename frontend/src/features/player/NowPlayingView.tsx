import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { MdMusicNote } from 'react-icons/md';
import type { SongMetadata } from '@/types';
import { resolveCover } from '@/utils/mediaPath';
import { useTheme } from '@/hooks/useTheme';


interface NowPlayingViewProps {
    metadata: SongMetadata | null;
}

export default function NowPlayingView({ metadata }: NowPlayingViewProps) {
    const { playerEffectMode } = useTheme();

    // Classic Mode Logic
    const [coverUrl, setCoverUrl] = useState<string | null>(null);

    useEffect(() => {
        if (playerEffectMode !== 'performance') return;

        let isMounted = true;
        const loadCover = async () => {
            if (!metadata) {
                setCoverUrl(null);
                return;
            }
            const url = await resolveCover(metadata);
            if (isMounted) {
                setCoverUrl(url);
            }
        };

        loadCover();
        return () => { isMounted = false; };
    }, [metadata, playerEffectMode]);


    if (playerEffectMode === 'animation') {
        return null;
    }

    const hasCover = !!coverUrl;

    return (
        <div className="relative flex-1 w-full h-full overflow-hidden bg-white dark:bg-[#121212]">
            {/* ... Classic View Content ... */}
            {/* 顶部拖动区域 */}
            <div
                data-tauri-drag-region
                className="absolute top-0 left-0 right-0 h-14 z-50"
            />

            {/* 背景层 */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                {hasCover ? (
                    <div className="absolute inset-0 scale-105">
                        <img
                            src={coverUrl!}
                            alt="Background"
                            className="w-full h-full object-cover blur-[60px] opacity-60 dark:opacity-40 transition-all duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-transparent to-white/30 dark:from-[#121212] dark:via-transparent dark:to-black/20" />
                    </div>
                ) : (
                    <div className="w-full h-full bg-neutral-100 dark:bg-[#1c1c1c]" />
                )}
            </div>

            {/* 内容层 */}
            <div className="absolute inset-0 z-10 flex items-end p-8 pb-12 sm:p-12 sm:pb-16">
                <div className="relative group animate-in fade-in slide-in-from-bottom-12 zoom-in-95 duration-700 ease-out">
                    <div className={clsx(
                        "relative aspect-square rounded-lg shadow-2xl overflow-hidden",
                        "w-48 sm:w-64 md:w-80 lg:w-96",
                        "bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center"
                    )}>
                        {hasCover ? (
                            <img src={coverUrl!} alt="Album Art" className="w-full h-full object-cover" />
                        ) : (
                            <MdMusicNote className="text-6xl text-neutral-400" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
