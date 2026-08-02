import MusicSlider from '@/components/common/MusicSlider';
import { usePlayerStore } from '@/store/usePlayerStore';
import type { SongMetadata } from '@/types';
import { formatTime } from '@/utils/time';

interface ApplePlayerProgressProps {
    metadata: SongMetadata | null;
    onChange: (value: number) => void;
    onMouseDown: () => void;
    onMouseUp: () => void;
    variant: 'standard' | 'narrow';
}

/** 将高频播放进度更新限制在进度条子树内。 */
export default function ApplePlayerProgress({
    metadata,
    onChange,
    onMouseDown,
    onMouseUp,
    variant,
}: ApplePlayerProgressProps) {
    const currentTime = usePlayerStore(state => state.currentTime);
    const isNarrow = variant === 'narrow';

    return (
        <div className="flex flex-col gap-1.5">
            <MusicSlider
                value={currentTime}
                min={0}
                max={metadata?.duration || 0}
                disabled={!metadata}
                onChange={onChange}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                trackHeightClass={isNarrow ? 'h-[6px]' : 'h-[clamp(4px,1vmin,8px)]'}
                hoverHeightClass={isNarrow ? 'group-hover:h-[8px]' : 'group-hover:h-[clamp(7px,1.75vmin,14px)]'}
                activeHeightClass={isNarrow ? 'group-active:h-[10px]' : 'group-active:h-[clamp(8px,2vmin,16px)]'}
            />
            <div className={isNarrow
                ? 'flex justify-between text-[11px] font-medium text-white/50 select-none'
                : 'flex justify-between text-[11px] font-medium text-white/40 select-none'}
            >
                <span>{formatTime(currentTime)}</span>
                <span>-{formatTime(Math.max(0, Math.floor(metadata?.duration || 0) - Math.floor(currentTime)))}</span>
            </div>
        </div>
    );
}
