import MusicSlider from '@/components/common/MusicSlider';
import { usePlayerStore } from '@/store/usePlayerStore';
import type { SongMetadata } from '@/types';
import { usePlaybackLoadingVisible } from '@/features/player/controls/usePlaybackLoadingVisible';
import { formatTime } from '@/utils/time';
import { NOW_PLAYING_SLIDER_SIZE } from '@/features/player/now-playing/controls/nowPlayingSliderSize';

interface NowPlayingProgressProps {
    metadata: SongMetadata | null;
    onChange: (value: number) => void;
    onMouseDown: () => void;
    onMouseUp: () => void;
    variant: 'standard' | 'narrow';
}

/** 将高频播放进度更新限制在进度条子树内。 */
export default function NowPlayingProgress({
    metadata,
    onChange,
    onMouseDown,
    onMouseUp,
    variant,
}: NowPlayingProgressProps) {
    const currentTime = usePlayerStore(state => state.currentTime);
    const loading = usePlaybackLoadingVisible();
    const isNarrow = variant === 'narrow';

    return (
        <div className="flex flex-col gap-1.5">
            <MusicSlider
                value={currentTime}
                min={0}
                max={metadata?.duration || 0}
                disabled={!metadata}
                dimWhenDisabled={false}
                loading={loading}
                onChange={onChange}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                {...NOW_PLAYING_SLIDER_SIZE}
            />
            <div className={isNarrow
                ? 'flex justify-between text-[max(1.2vh,0.8rem)] font-medium text-white/50 select-none'
                : 'flex justify-between text-[max(1.2vh,0.8rem)] font-medium text-white/40 select-none'}
            >
                <span>{formatTime(currentTime)}</span>
                <span>-{formatTime(Math.max(0, Math.floor(metadata?.duration || 0) - Math.floor(currentTime)))}</span>
            </div>
        </div>
    );
}
