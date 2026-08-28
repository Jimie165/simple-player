import { useState } from 'react';
import clsx from 'clsx';
import { usePlayerStore } from '@/store/usePlayerStore';

// 引入子组件
import SongInfo from '@/features/player/controls/SongInfo';
import PlaybackControls from '@/features/player/controls/PlaybackControls';
import ExtraControls from '@/features/player/controls/ExtraControls';

// 引入 Common 组件
import InfoDialog from '@/components/common/InfoDialog';

interface PlayerControlProps {
    isFullScreen: boolean;
    isSuspended: boolean;
    onToggleFullScreen: () => void;
    sidebarOffset: number;
    mode: 'full' | 'compact' | 'mini';
}

export default function PlayerControl({ isFullScreen, isSuspended, onToggleFullScreen, sidebarOffset, mode }: PlayerControlProps) {
    const metadata = usePlayerStore(s => s.metadata);
    const [isInfoOpen, setIsInfoOpen] = useState(false);
    const isMini = mode === 'mini';

    return (
        <>
            <div className={clsx(
                "pointer-events-none fixed bottom-4 right-0 z-75 flex justify-center px-4 transition-[left] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
            )}
                style={{ left: sidebarOffset }}
            >
                <div className={clsx(
                    "pointer-events-auto relative isolate grid w-full items-center gap-3 rounded-full border border-black/8 bg-white/72 shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur-[22px] backdrop-saturate-180 dark:border-transparent dark:bg-[#2b2e35]/78 dark:shadow-[0_18px_42px_rgba(0,0,0,0.38)] dark:ring-1 dark:ring-black/18",
                    mode === 'full' && "h-20 max-w-190 grid-cols-[172px_minmax(0,1fr)_178px] px-8",
                    mode === 'compact' && "h-20 max-w-190 grid-cols-[172px_minmax(0,1fr)_40px] px-8",
                    isMini && "h-18 max-w-115 grid-cols-[minmax(0,1fr)_104px] px-4"
                )}>
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-px hidden rounded-full dark:block dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.022)_42%,rgba(255,255,255,0)_100%)]"
                    />
                    <button
                        type="button"
                        onClick={onToggleFullScreen}
                        className={clsx(
                            "absolute top-2 h-8 rounded-full bg-transparent",
                            mode === 'full' && "left-43 right-32",
                            mode === 'compact' && "left-43 right-23",
                            isMini && "hidden"
                        )}
                        aria-label="打开播放页"
                    />

                    <PlaybackControls mode={mode} isSuspended={isSuspended} />

                    <div className={clsx(
                        "relative z-10 row-start-1",
                        isMini ? "col-start-1" : "col-start-2"
                    )}>
                        <SongInfo
                            metadata={metadata}
                            isFullScreen={isFullScreen}
                            onToggleFullScreen={onToggleFullScreen}
                        />
                    </div>

                    <div className={clsx(
                        "relative z-10 col-start-3 row-start-1",
                        isMini && "hidden"
                    )}>
                        <ExtraControls
                            mode={mode}
                            onInfoClick={() => setIsInfoOpen(true)}
                        />
                    </div>

                </div>
            </div>

            {/* 属性弹窗放在最外层 */}
            <InfoDialog isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
        </>
    );
}
