import { FiMaximize2, FiMinimize2 } from 'react-icons/fi';

interface ApplePlayerTopBarProps {
    isFullscreen: boolean;
    onClose: () => void;
    toggleFullscreen: () => void;
}

export default function ApplePlayerTopBar({ isFullscreen, onClose, toggleFullscreen }: ApplePlayerTopBarProps) {
    return (
        <div
            data-tauri-drag-region={isFullscreen ? undefined : ''}
            className="w-full h-16 z-50 flex justify-center items-center flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity relative"
        >
            <button
                onClick={onClose}
                className="w-12 h-1.5 bg-white/40 rounded-full hover:bg-white/60 transition-colors cursor-pointer"
            />

            <button
                onClick={toggleFullscreen}
                className="absolute right-6 p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all backdrop-blur-md"
            >
                {isFullscreen ? <FiMinimize2 className="text-xl" /> : <FiMaximize2 className="text-xl" />}
            </button>
        </div>
    );
}
