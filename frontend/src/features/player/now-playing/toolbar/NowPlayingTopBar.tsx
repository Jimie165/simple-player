import { FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import { systemService } from '@/services/systemService';

interface NowPlayingTopBarProps {
    isFullscreen: boolean;
    onClose: () => void;
    toggleFullscreen: () => void;
}

export default function NowPlayingTopBar({ isFullscreen, onClose, toggleFullscreen }: NowPlayingTopBarProps) {
    return (
        <div
            className="w-full h-16 z-50 flex justify-center items-center flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity relative"
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
                className="group relative z-10 flex h-12 w-24 items-center justify-center cursor-pointer touch-manipulation"
            >
                <span
                    aria-hidden="true"
                    className="h-1.5 w-12 rounded-full bg-white/40 transition-colors group-hover:bg-white/60"
                />
            </button>

            {(!systemService.isMacOS || isFullscreen) && (
                <button
                    data-tauri-drag-region="false"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
                    className="graphics-fallback-dark absolute right-6 z-10 p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all backdrop-blur-md touch-manipulation"
                >
                    {isFullscreen ? <FiMinimize2 className="text-xl" /> : <FiMaximize2 className="text-xl" />}
                </button>
            )}
        </div>
    );
}
