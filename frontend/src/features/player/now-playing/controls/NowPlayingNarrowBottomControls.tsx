import clsx from 'clsx';
import NowPlayingTransportIcon from '@/features/player/now-playing/controls/NowPlayingTransportIcon';
import NowPlayingToggleIcon from '@/features/player/now-playing/controls/NowPlayingToggleIcon';
import {
    IoVolumeHigh,
    IoVolumeLow,
    IoVolumeMedium,
    IoVolumeOff,
} from 'react-icons/io5';
import MusicSlider from '@/components/common/MusicSlider';
import type { NowPlayingControlsSectionProps } from '@/features/player/now-playing/controls/NowPlayingControlTypes';
import NowPlayingProgress from '@/features/player/now-playing/controls/NowPlayingProgress';

export function NowPlayingNarrowBottomControls({
    metadata,
    handleSeekChange,
    handleSeekStart,
    handleSeekEnd,
    isShuffling,
    toggleShuffle,
    playPrev,
    togglePlay,
    isPlaying,
    playNext,
    toggleRepeat,
    repeatMode,
    localVolume,
    handleVolumeChange,
    handleVolumeSeekStart,
    handleVolumeSeekEnd,
}: Pick<NowPlayingControlsSectionProps,
    'metadata' |
    'handleSeekChange' |
    'handleSeekStart' |
    'handleSeekEnd' |
    'isShuffling' |
    'toggleShuffle' |
    'playPrev' |
    'togglePlay' |
    'isPlaying' |
    'playNext' |
    'toggleRepeat' |
    'repeatMode' |
    'localVolume' |
    'handleVolumeChange' |
    'handleVolumeSeekStart' |
    'handleVolumeSeekEnd'
>) {
    return (
        <div className="flex flex-col gap-6">
            <div className="relative z-30 mix-blend-plus-lighter">
                <NowPlayingProgress
                    metadata={metadata}
                    onChange={handleSeekChange}
                    onMouseDown={handleSeekStart}
                    onMouseUp={handleSeekEnd}
                    variant="narrow"
                />
            </div>

            <div className="flex items-center justify-between w-full">
                <button
                    onClick={toggleShuffle}
                    className={clsx(
                        'relative z-30 w-10 h-10 shrink-0 flex items-center justify-center rounded-lg transition-opacity text-white mix-blend-plus-lighter group/toggle [&:hover>svg[data-selected=false]]:opacity-60'
                    )}
                >
                    <NowPlayingToggleIcon selected={isShuffling} icon="shuffle" />
                </button>

                <button onClick={playPrev} className="relative z-30 w-12 h-12 shrink-0 flex items-center justify-center text-white hover:scale-105 transition-all">
                    <NowPlayingTransportIcon icon="previous" className="w-9 h-9" />
                </button>

                <button
                    onClick={togglePlay}
                    className="relative z-30 shrink-0 w-16 h-16 rounded-full bg-transparent text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all overflow-hidden"
                >
                    <NowPlayingTransportIcon icon={isPlaying ? 'pause' : 'play'} className={clsx('w-12 h-12', !isPlaying && 'ml-1')} />
                </button>

                <button onClick={playNext} className="relative z-30 w-12 h-12 shrink-0 flex items-center justify-center text-white hover:scale-105 transition-all">
                    <NowPlayingTransportIcon icon="next" className="w-9 h-9" />
                </button>

                <button
                    onClick={toggleRepeat}
                    className={clsx(
                        'z-30 w-10 h-10 shrink-0 flex items-center justify-center rounded-lg transition-opacity relative text-white mix-blend-plus-lighter group/toggle [&:hover>svg[data-selected=false]]:opacity-60'
                    )}
                >
                    <NowPlayingToggleIcon selected={repeatMode !== 'off'} icon="repeat" repeatOne={repeatMode === 'one'} />
                </button>
            </div>

            <div className="relative z-30 flex items-center gap-4 px-1 mt-1 mix-blend-plus-lighter">
                {(() => {
                    if (localVolume === 0) return <IoVolumeOff className="text-white/50 text-sm" />;
                    if (localVolume <= 33) return <IoVolumeLow className="text-white/50 text-sm" />;
                    if (localVolume <= 66) return <IoVolumeMedium className="text-white/50 text-sm" />;
                    return <IoVolumeHigh className="text-white/50 text-sm" />;
                })()}
                <MusicSlider
                    value={localVolume}
                    min={0}
                    max={100}
                    onChange={handleVolumeChange}
                    onMouseDown={handleVolumeSeekStart}
                    onMouseUp={handleVolumeSeekEnd}
                    trackHeightClass="h-[6px]"
                    hoverHeightClass="group-hover:h-[8px]"
                    activeHeightClass="group-active:h-[10px]"
                    className="flex-1"
                />
                <IoVolumeHigh className="text-white/50 text-sm" />
            </div>
        </div>
    );
}
