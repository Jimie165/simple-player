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
    rightOffset: number;
    mode: 'full' | 'compact' | 'mini';
    isQueueOpen: boolean;
    canShowQueue: boolean;
    onToggleQueue: () => void;
}

export default function PlayerControl({ isFullScreen, isSuspended, onToggleFullScreen, sidebarOffset, rightOffset, mode, isQueueOpen, canShowQueue, onToggleQueue }: PlayerControlProps) {
    const metadata = usePlayerStore(s => s.metadata);
    const [isInfoOpen, setIsInfoOpen] = useState(false);
    const isMini = mode === 'mini';

    return (
        <>
            <div className={clsx(
                "pointer-events-none fixed bottom-4 z-75 flex justify-center px-4 transition-[left,right] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
            )}
                style={{ left: sidebarOffset, right: rightOffset }}
            >
                <div className={clsx(
                    "content-player-shell pointer-events-auto relative isolate grid w-full items-center gap-3 rounded-full",
                    !isMini && "h-14 max-w-170 grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 px-4",
                    isMini && "h-14 max-w-115 grid-cols-[minmax(0,1fr)_auto] pr-4 pl-[11px]"
                )}>
                    <PlaybackControls mode={mode} isSuspended={isSuspended} />

                    <div className={clsx(
                        "relative z-10 row-start-1",
                        isMini ? "col-start-1" : "col-start-2"
                    )}>
                        <SongInfo
                            metadata={metadata}
                            isFullScreen={isFullScreen}
                            onToggleFullScreen={onToggleFullScreen}
                            isMini={isMini}
                        />
                    </div>

                    <div className={clsx(
                        "relative z-10 col-start-3 row-start-1",
                        isMini && "hidden"
                    )}>
                        <ExtraControls
                            mode={mode}
                            onInfoClick={() => setIsInfoOpen(true)}
                            isQueueOpen={isQueueOpen}
                            canShowQueue={canShowQueue}
                            onToggleQueue={onToggleQueue}
                        />
                    </div>

                </div>
            </div>

            {/* 属性弹窗放在最外层 */}
            <InfoDialog isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
        </>
    );
}
