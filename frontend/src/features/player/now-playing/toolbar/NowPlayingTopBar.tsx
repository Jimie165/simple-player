import { FiMaximize2, FiMinimize2 } from 'react-icons/fi';

interface NowPlayingTopBarProps {
    isFullscreen: boolean;
    onClose: () => void;
    toggleFullscreen: () => void;
}

export default function NowPlayingTopBar({ isFullscreen, onClose, toggleFullscreen }: NowPlayingTopBarProps) {
    return (
        <div
            className="w-full h-16 z-50 flex justify-center items-center shrink-0 relative mix-blend-plus-lighter"
        >
            {!isFullscreen && (
                <div
                    data-tauri-drag-region
                    aria-hidden="true"
                    className="absolute inset-0 z-0"
                />
            )}
            <button
                data-tauri-drag-region="false"
                onClick={onClose}
                aria-label="关闭正在播放"
                className="group/close relative z-10 flex h-12 w-24 items-center justify-center cursor-pointer touch-manipulation"
            >
                <span
                    aria-hidden="true"
                    className="h-1.5 w-12 rounded-full bg-white/20 transition-colors group-hover/close:bg-white/60 group-focus-visible/close:bg-white/60"
                />
            </button>

            <button
                data-tauri-drag-region="false"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
                className="graphics-fallback-dark absolute right-6 z-10 p-2 rounded-full text-white/20 hover:text-white hover:bg-white/10 focus-visible:text-white transition-colors backdrop-blur-md touch-manipulation"
            >
                {isFullscreen ? <FiMinimize2 className="text-xl" /> : <FiMaximize2 className="text-xl" />}
            </button>
        </div>
    );
}
