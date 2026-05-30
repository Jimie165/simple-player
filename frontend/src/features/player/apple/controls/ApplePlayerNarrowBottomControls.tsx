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
import { formatTime } from '@/utils/time';
import type { ApplePlayerControlsSectionProps } from '@/features/player/apple/controls/ApplePlayerControlTypes';

export function ApplePlayerNarrowBottomControls({
    metadata,
    currentTime,
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
}: Pick<ApplePlayerControlsSectionProps,
    'metadata' |
    'currentTime' |
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
            <div className="flex flex-col gap-1.5">
                <MusicSlider
                    value={currentTime}
                    min={0}
                    max={metadata?.duration || 0}
                    disabled={!metadata}
                    onChange={handleSeekChange}
                    onMouseDown={handleSeekStart}
                    onMouseUp={handleSeekEnd}
                    trackHeightClass="h-[6px]"
                    hoverHeightClass="group-hover:h-[8px]"
                    activeHeightClass="group-active:h-[10px]"
                />
                <div className="flex justify-between text-[11px] font-medium text-white/50 select-none">
                    <span>{formatTime(currentTime)}</span>
                    <span>-{formatTime(Math.max(0, Math.floor(metadata?.duration || 0) - Math.floor(currentTime)))}</span>
                </div>
            </div>

            <div className="flex items-center justify-between w-full">
                <button
                    onClick={toggleShuffle}
                    className={clsx(
                        'w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10',
                        isShuffling ? 'text-primary' : 'text-white/50 hover:text-white'
                    )}
                >
                    <IoShuffle className="w-5 h-5" />
                </button>

                <button onClick={playPrev} className="w-12 h-12 flex-shrink-0 flex items-center justify-center text-white hover:opacity-70 transition-opacity">
                    <IoPlayBack className="w-9 h-9" />
                </button>

                <button
                    onClick={togglePlay}
                    className="flex-shrink-0 w-16 h-16 rounded-full bg-transparent text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all overflow-hidden"
                >
                    {isPlaying ? <IoPause className="w-12 h-12" /> : <IoPlay className="w-12 h-12 ml-1" />}
                </button>

                <button onClick={playNext} className="w-12 h-12 flex-shrink-0 flex items-center justify-center text-white hover:opacity-70 transition-opacity">
                    <IoPlayForward className="w-9 h-9" />
                </button>

                <button
                    onClick={toggleRepeat}
                    className={clsx(
                        'w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors relative hover:bg-white/10',
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
