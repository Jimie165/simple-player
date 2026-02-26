import { useState, useRef, useEffect } from 'react';
import { MdVolumeUp, MdVolumeDown, MdVolumeMute, MdInfoOutline, MdQueueMusic } from 'react-icons/md';
import clsx from 'clsx';
import { usePlayerStore } from '@/store/usePlayerStore';
import VolumePopup from '@/components/common/VolumePopup';
import CustomTooltip from '@/components/common/CustomTooltip';
import PlayQueuePopup from '@/features/player/controls/PlayQueuePopup'; // 引入新组件

interface ExtraControlsProps {
    onInfoClick: () => void;
}

export default function ExtraControls({ onInfoClick }: ExtraControlsProps) {
    const { volume } = usePlayerStore();
    const [localVolume, setLocalVolume] = useState(volume);
    const [showVolumePopup, setShowVolumePopup] = useState(false);
    const [showQueuePopup, setShowQueuePopup] = useState(false); // 队列弹窗状态

    // 当全局 volume 因为其他原因本身发生改变（比如松开手保存后，或初始化时），同步给外部按钮显示
    useEffect(() => {
        setLocalVolume(volume);
    }, [volume]);

    const volumeRef = useRef<HTMLDivElement>(null);
    const queueRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭逻辑 (合并处理)
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            // Ignore clicks inside Headless UI menus (Portals)
            const target = event.target as Element;
            if (target && target.closest && (target.closest('[role="menu"]') || target.closest('[role="dialog"]') || target.closest('[data-menu-portal="true"]'))) {
                return;
            }

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
                <PlayQueuePopup show={showQueuePopup} onNavigateClose={() => setShowQueuePopup(false)} />
                <CustomTooltip text="播放队列">
                    <button
                        onClick={() => setShowQueuePopup(!showQueuePopup)}
                        className={clsx(
                            "p-2 rounded-lg transition-colors",
                            showQueuePopup
                                ? "bg-neutral-100 text-primary dark:bg-white/10"
                                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
                        )}
                    >
                        <MdQueueMusic className="text-xl" />
                    </button>
                </CustomTooltip>
            </div>

            {/* 2. 音量 */}
            <div className="relative" ref={volumeRef}>
                <VolumePopup show={showVolumePopup} onChange={setLocalVolume} />
                <CustomTooltip text={`音量: ${localVolume}%`}>
                    <button
                        onClick={() => setShowVolumePopup(!showVolumePopup)}
                        className={clsx(
                            "p-2 rounded-lg transition-colors",
                            showVolumePopup ? "bg-neutral-100 text-primary dark:bg-white/10" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
                        )}
                    >
                        {(() => {
                            if (localVolume === 0) return <MdVolumeMute className="text-xl" />;
                            if (localVolume <= 50) return <MdVolumeDown className="text-xl" />;
                            return <MdVolumeUp className="text-xl" />;
                        })()}
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