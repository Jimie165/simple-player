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

    const utilityButtonClass = "grid h-8 w-8 place-items-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-900 dark:text-white/64 dark:hover:bg-white/10 dark:hover:text-white/90";
    const controls = (
        <>
            <div className="relative" ref={queueRef}>
                <PlayQueuePopup show={showQueuePopup} onNavigateClose={() => setShowQueuePopup(false)} />
                <CustomTooltip text="播放队列" disabled={showQueuePopup}>
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
                <CustomTooltip text={`音量: ${localVolume}%`} disabled={showVolumePopup}>
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
                    className={clsx(utilityButtonClass, "text-neutral-500 dark:text-white/58")}
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
                <CustomTooltip text="更多" disabled={showCompactMenu}>
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
                <div className="absolute right-0 bottom-11 z-30 flex items-center gap-1 rounded-full border border-black/[0.08] bg-white/[0.78] px-2 py-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.14)] backdrop-blur-[20px] backdrop-saturate-[180%] dark:border-white/[0.14] dark:bg-[#24262c]/[0.78] dark:shadow-[0_16px_34px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,255,255,0.03)] dark:ring-1 dark:ring-white/[0.04]">
                    {controls}
                </div>
            )}
        </div>
    );
}
