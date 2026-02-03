import clsx from 'clsx';
import { usePlayerStore } from '@/store/usePlayerStore';

interface VolumePopupProps {
    show: boolean;
}

export default function VolumePopup({ show }: VolumePopupProps) {
    // 从 Store 获取和设置音量
    const { volume, setVolume } = usePlayerStore();

    return (
        <div className={clsx(
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-3 rounded-xl shadow-xl border",
            "bg-white dark:bg-[#2d2d2d] border-neutral-100 dark:border-neutral-700",
            "transition-all duration-200 origin-bottom",
            show ? "opacity-100 scale-100 visible" : "opacity-0 scale-95 invisible pointer-events-none"
        )}>
            <div className="flex items-center gap-3 w-32">
                {/* 原生 Range Input 加上自定义样式 */}
                <input
                    type="range"
                    min="0" max="100"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-500 hover:accent-neutral-700 dark:bg-neutral-600 dark:accent-neutral-400"
                />
                <span className="text-xs font-medium w-6 text-right tabular-nums text-neutral-900 dark:text-neutral-100">
                    {volume}
                </span>
            </div>
            {/* 底部的小三角箭头 */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-8 border-transparent border-t-white dark:border-t-[#2d2d2d]" />
        </div>
    );
}