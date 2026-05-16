import { useState, useRef, useEffect } from 'react';
import { MdVolumeUp, MdVolumeDown, MdVolumeMute, MdInfoOutline, MdQueueMusic, MdMoreHoriz } from 'react-icons/md';
import clsx from 'clsx';
import { usePlayerStore } from '@/store/usePlayerStore';
import VolumePopup from '@/components/common/VolumePopup';
import CustomTooltip from '@/components/common/CustomTooltip';
import PlayQueuePopup from '@/features/player/controls/PlayQueuePopup'; // 引入新组件

interface ExtraControlsProps {
    onInfoClick: () => void;
    mode: 'full' | 'compact' | 'mini';
}

export default function ExtraControls({ onInfoClick, mode }: ExtraControlsProps) {
    const { volume } = usePlayerStore();
    const [localVolume, setLocalVolume] = useState(volume);
    const [showVolumePopup, setShowVolumePopup] = useState(false);
    const [showQueuePopup, setShowQueuePopup] = useState(false); // 队列弹窗状态
    const [showCompactMenu, setShowCompactMenu] = useState(false);

    // 当全局 volume 因为其他原因本身发生改变（比如松开手保存后，或初始化时），同步给外部按钮显示
    useEffect(() => {
        setLocalVolume(volume);
    }, [volume]);

    const volumeRef = useRef<HTMLDivElement>(null);
    const queueRef = useRef<HTMLDivElement>(null);
    const compactRef = useRef<HTMLDivElement>(null);

    const closeCompactMenu = () => {
        setShowCompactMenu(false);
        setShowQueuePopup(false);
        setShowVolumePopup(false);
    };

    const toggleCompactMenu = () => {
        setShowCompactMenu((value) => {
            if (value) {
                setShowQueuePopup(false);
                setShowVolumePopup(false);
            }
            return !value;
        });
    };

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
            if (compactRef.current && !compactRef.current.contains(event.target as Node)) {
                setShowCompactMenu(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const utilityButtonClass = "grid h-8 w-8 place-items-center rounded-full text-neutral-700 transition-colors hover:bg-black/5 hover:text-black dark:text-neutral-100 dark:hover:bg-white/10";
    const controls = (
        <>
            <div className="relative" ref={queueRef}>
                <PlayQueuePopup show={showQueuePopup} onNavigateClose={() => setShowQueuePopup(false)} />
                <CustomTooltip text="播放队列">
                    <button
                        onClick={() => {
                            setShowQueuePopup((value) => !value);
                            setShowVolumePopup(false);
                            if (mode === 'full') setShowCompactMenu(false);
                        }}
                        className={clsx(
                            utilityButtonClass,
                            showQueuePopup
                                ? "bg-black/5 text-[#d60017] dark:bg-white/10 dark:text-[#ff375f]"
                                : ""
                        )}
                    >
                        <MdQueueMusic className="text-xl" />
                    </button>
                </CustomTooltip>
            </div>

            <div className="relative" ref={volumeRef}>
                <VolumePopup show={showVolumePopup} onChange={setLocalVolume} />
                <CustomTooltip text={`音量: ${localVolume}%`}>
                    <button
                        onClick={() => {
                            setShowVolumePopup((value) => !value);
                            setShowQueuePopup(false);
                            if (mode === 'full') setShowCompactMenu(false);
                        }}
                        className={clsx(
                            utilityButtonClass,
                            showVolumePopup ? "bg-black/5 text-[#d60017] dark:bg-white/10 dark:text-[#ff375f]" : ""
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

            <CustomTooltip text="属性">
                <button
                    onClick={() => {
                        onInfoClick();
                        closeCompactMenu();
                    }}
                    className={clsx(utilityButtonClass, "text-neutral-500 dark:text-neutral-300")}
                >
                    <MdInfoOutline className="text-xl" />
                </button>
            </CustomTooltip>
        </>
    );

    return (
        <div className="relative flex min-w-0 items-center justify-end gap-1" ref={compactRef}>
            <div className={clsx(
                "items-center justify-end gap-1",
                mode === 'full' ? "flex" : "hidden"
            )}>
                {controls}
            </div>

            <div className={clsx(mode === 'compact' ? "block" : "hidden")}>
                <CustomTooltip text="更多">
                    <button
                        onClick={toggleCompactMenu}
                        className={clsx(
                            utilityButtonClass,
                            showCompactMenu && "bg-black/5 dark:bg-white/10"
                        )}
                    >
                        <MdMoreHoriz className="text-2xl" />
                    </button>
                </CustomTooltip>
            </div>

            {showCompactMenu && (
                <div className="absolute bottom-11 right-0 flex items-center gap-1 rounded-full border border-white/55 bg-white/70 px-2 py-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.16)] backdrop-blur-2xl ring-1 ring-black/5 dark:border-white/10 dark:bg-[#2b2b2f]/72 dark:ring-white/10">
                    {controls}
                </div>
            )}
        </div>
    );
}
