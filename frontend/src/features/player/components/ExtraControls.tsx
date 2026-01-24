import { useState, useRef, useEffect } from 'react';
import { MdVolumeUp, MdVolumeOff, MdInfoOutline, MdQueueMusic } from 'react-icons/md';
import clsx from 'clsx';
import { usePlayerStore } from '../../../store/usePlayerStore';
import VolumePopup from '../../../components/common/VolumePopup';
import CustomTooltip from '../../../components/common/CustomTooltip';
import PlayQueuePopup from './PlayQueuePopup'; // 引入新组件

interface ExtraControlsProps {
    onInfoClick: () => void;
}

export default function ExtraControls({ onInfoClick }: ExtraControlsProps) {
    const { volume } = usePlayerStore();
    const [showVolumePopup, setShowVolumePopup] = useState(false);
    const [showQueuePopup, setShowQueuePopup] = useState(false); // 队列弹窗状态

    const volumeRef = useRef<HTMLDivElement>(null);
    const queueRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭逻辑 (合并处理)
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (volumeRef.current && !volumeRef.current.contains(event.target as Node)) {
                setShowVolumePopup(false);
            }
            if (queueRef.current && !queueRef.current.contains(event.target as Node)) {
                setShowQueuePopup(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="w-[30%] min-w-0 flex justify-end items-center gap-1">

            {/* 1. 播放队列 */}
            <div className="relative" ref={queueRef}>
                <PlayQueuePopup show={showQueuePopup} />
                <CustomTooltip text="播放队列">
                    <button
                        onClick={() => setShowQueuePopup(!showQueuePopup)}
                        className={clsx(
                            "p-2 rounded-lg transition-colors",
                            showQueuePopup
                                ? "bg-neutral-100 text-blue-600 dark:bg-white/10 dark:text-blue-400"
                                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
                        )}
                    >
                        <MdQueueMusic className="text-xl" />
                    </button>
                </CustomTooltip>
            </div>

            {/* 2. 音量 */}
            <div className="relative" ref={volumeRef}>
                <VolumePopup show={showVolumePopup} />
                <CustomTooltip text={`音量: ${volume}%`}>
                    <button
                        onClick={() => setShowVolumePopup(!showVolumePopup)}
                        className={clsx(
                            "p-2 rounded-lg transition-colors",
                            showVolumePopup ? "bg-neutral-100 text-blue-600 dark:bg-white/10 dark:text-blue-400" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
                        )}
                    >
                        {volume === 0 ? <MdVolumeOff className="text-xl" /> : <MdVolumeUp className="text-xl" />}
                    </button>
                </CustomTooltip>
            </div>

            {/* 3. 属性 */}
            <CustomTooltip text="属性">
                <button
                    onClick={onInfoClick}
                    className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200 transition-colors"
                >
                    <MdInfoOutline className="text-xl" />
                </button>
            </CustomTooltip>
        </div>
    );
}