import clsx from 'clsx';
import {
    IoPause,
    IoPlay,
    IoPlayBack,
    IoPlayForward,
    IoRepeat,
    IoShuffle,
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
            <NowPlayingProgress
                metadata={metadata}
                onChange={handleSeekChange}
                onMouseDown={handleSeekStart}
                onMouseUp={handleSeekEnd}
                variant="narrow"
            />

            <div className="flex items-center justify-between w-full">
                <button
                    onClick={toggleShuffle}
                    className={clsx(
                        'w-10 h-10 shrink-0 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10',
                        isShuffling ? 'text-primary' : 'text-white/50 hover:text-white'
                    )}
                >
                    <IoShuffle className="w-5 h-5" />
                </button>

                <button onClick={playPrev} className="w-12 h-12 shrink-0 flex items-center justify-center text-white hover:scale-105 transition-all">
                    <IoPlayBack className="w-9 h-9" />
                </button>

                <button
                    onClick={togglePlay}
                    className="shrink-0 w-16 h-16 rounded-full bg-transparent text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all overflow-hidden"
                >
                    {isPlaying ? <IoPause className="w-12 h-12" /> : <IoPlay className="w-12 h-12 ml-1" />}
                </button>

                <button onClick={playNext} className="w-12 h-12 shrink-0 flex items-center justify-center text-white hover:scale-105 transition-all">
                    <IoPlayForward className="w-9 h-9" />
                </button>

                <button
                    onClick={toggleRepeat}
                    className={clsx(
                        'w-10 h-10 shrink-0 flex items-center justify-center rounded-lg transition-colors relative hover:bg-white/10',
                        repeatMode !== 'off' ? 'text-primary' : 'text-white/50 hover:text-white'
                    )}
                >
                    {repeatMode === 'one' ? (
                        <div className="relative w-full h-full flex items-center justify-center">
                            <IoRepeat className="w-5 h-5" />
                            <span className="absolute top-1 right-1 text-[8px] font-bold">1</span>
                        </div>
                    ) : (
                        <IoRepeat className="w-5 h-5" />
                    )}
                </button>
            </div>

            <div className="flex items-center gap-4 px-1 mt-1">
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
