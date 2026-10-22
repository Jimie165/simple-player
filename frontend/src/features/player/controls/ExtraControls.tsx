import MoreIcon from '@/components/common/MoreIcon';
import { useState, useRef, useEffect } from 'react';
import { MdVolumeUp, MdVolumeDown, MdVolumeMute, MdInfoOutline, MdQueueMusic } from 'react-icons/md';
import clsx from 'clsx';
import { usePlayerStore } from '@/store/usePlayerStore';
import VolumePopup from '@/components/common/VolumePopup';
import CustomTooltip from '@/components/common/CustomTooltip';

interface ExtraControlsProps {
    onInfoClick: () => void;
    mode: 'full' | 'compact' | 'mini';
    isQueueOpen: boolean;
    canShowQueue: boolean;
    onToggleQueue: () => void;
}

export default function ExtraControls({ onInfoClick, mode, isQueueOpen, canShowQueue, onToggleQueue }: ExtraControlsProps) {
    const volume = usePlayerStore(s => s.volume);
    const [localVolume, setLocalVolume] = useState(volume);
    const [showVolumePopup, setShowVolumePopup] = useState(false);
    const [showCompactMenu, setShowCompactMenu] = useState(false);

    // 当全局 volume 因为其他原因本身发生改变（比如松开手保存后，或初始化时），同步给外部按钮显示
    useEffect(() => {
        setLocalVolume(volume);
    }, [volume]);

    const volumeRef = useRef<HTMLDivElement>(null);
    const compactRef = useRef<HTMLDivElement>(null);

    const closeCompactMenu = () => {
        setShowCompactMenu(false);
        setShowVolumePopup(false);
    };

    const toggleCompactMenu = () => {
        setShowCompactMenu((value) => {
            if (value) {
                setShowVolumePopup(false);
            }
            return !value;
        });
    };

    // 点击外部关闭逻辑 (合并处理)
    useEffect(() => {
        function handleClickOutside(event: PointerEvent) {
            // Ignore clicks inside Headless UI menus (Portals)
            const target = event.target as Element;
            if (target && target.closest && (target.closest('[role="menu"]') || target.closest('[role="dialog"]') || target.closest('[data-menu-portal="true"]'))) {
                return;
            }

            if (volumeRef.current && !volumeRef.current.contains(event.target as Node)) {
                setShowVolumePopup(false);
            }
            if (compactRef.current && !compactRef.current.contains(event.target as Node)) {
                setShowCompactMenu(false);
            }
        }
        document.addEventListener("pointerdown", handleClickOutside);
        return () => document.removeEventListener("pointerdown", handleClickOutside);
    }, []);

    const utilityButtonClass = "grid h-8 w-8 place-items-center rounded-full text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-900 dark:text-white/64 dark:hover:bg-white/10 dark:hover:text-white/90";
    const volumeIconClass = clsx("text-xl", showVolumePopup && "text-primary");
    const queueButton = (
        <CustomTooltip text="播放队列">
            <button
                onClick={() => {
                    onToggleQueue();
                    setShowVolumePopup(false);
                    setShowCompactMenu(false);
                }}
                aria-label="播放队列"
                aria-expanded={isQueueOpen}
                aria-controls="content-play-queue"
                className={clsx(utilityButtonClass, isQueueOpen && "bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary")}
            >
                <MdQueueMusic className={clsx("text-xl", isQueueOpen && "text-primary")} />
            </button>
        </CustomTooltip>
    );
    const controls = (
        <>
            {canShowQueue && queueButton}

            <div className="relative" ref={volumeRef}>
                <VolumePopup show={showVolumePopup} onChange={setLocalVolume} />
                <CustomTooltip text={`音量: ${localVolume}%`} disabled={showVolumePopup}>
                    <button
                        onClick={() => {
                            setShowVolumePopup((value) => !value);
                            if (mode === 'full') setShowCompactMenu(false);
                        }}
                        className={clsx(
                            utilityButtonClass,
                            showVolumePopup ? "bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary" : ""
                        )}
                    >
                        {(() => {
                            if (localVolume === 0) return <MdVolumeMute className={volumeIconClass} />;
                            if (localVolume <= 50) return <MdVolumeDown className={volumeIconClass} />;
                            return <MdVolumeUp className={volumeIconClass} />;
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
                        <MoreIcon />
                    </button>
                </CustomTooltip>
            </div>

            {showCompactMenu && (
                <div className="absolute right-0 bottom-11 z-30 flex items-center gap-1 rounded-full border border-black/8 bg-white/78 px-2 py-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.14)] backdrop-blur-[20px] backdrop-saturate-180 dark:border-white/[0.14] dark:bg-[#24262c]/78 dark:shadow-[0_16px_34px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,255,255,0.03)] dark:ring-1 dark:ring-white/4">
                    {controls}
                </div>
            )}
        </div>
    );
}
