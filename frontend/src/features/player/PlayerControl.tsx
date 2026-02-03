import { useState } from 'react';
import clsx from 'clsx';
import { usePlayerStore } from '@/store/usePlayerStore';

// 引入子组件
import SongInfo from './components/SongInfo';
import PlaybackControls from './components/PlaybackControls';
import ExtraControls from './components/ExtraControls';

// 引入 Common 组件
import InfoDialog from '@/components/common/InfoDialog';

interface PlayerControlProps {
    isFullScreen: boolean;
    onToggleFullScreen: () => void;
}

export default function PlayerControl({ isFullScreen, onToggleFullScreen }: PlayerControlProps) {
    const { metadata } = usePlayerStore();
    const [isInfoOpen, setIsInfoOpen] = useState(false);

    return (
        <>
            <div className={clsx(
                "flex h-24 w-full flex-col justify-center border-t px-4 z-50 transition-colors duration-300",
                "border-outline-variant/20 bg-surface-container-high"
            )}>
                {/* 30-40-30 布局容器 */}
                <div className="flex items-center justify-between gap-4">

                    <SongInfo
                        metadata={metadata}
                        isFullScreen={isFullScreen}
                        onToggleFullScreen={onToggleFullScreen}
                    />

                    <PlaybackControls />

                    <ExtraControls
                        onInfoClick={() => setIsInfoOpen(true)}
                    />

                </div>
            </div>

            {/* 属性弹窗放在最外层 */}
            <InfoDialog isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
        </>
    );
}
