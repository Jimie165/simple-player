import clsx from 'clsx';
import {
    IoPlay,
    IoPause,
    IoShuffle,
    IoRepeat,
    IoVolumeOff,
    IoVolumeLow,
    IoVolumeMedium,
    IoVolumeHigh,
    IoStar,
    IoStarOutline,
    IoPlayBack,
    IoPlayForward,
} from 'react-icons/io5';
import { formatTime } from '@/utils/time';
import MusicSlider from '@/components/common/MusicSlider';
import { PlayerMenuWrapper } from '@/features/player/apple/controls/PlayerMenuButton';
import OverflowMarquee from '@/components/common/OverflowMarquee';
import type { ApplePlayerControlsSectionProps } from '@/features/player/apple/controls/ApplePlayerControlTypes';
import { useApplePlayerNavigation } from '@/features/player/apple/controls/useApplePlayerNavigation';

export type { ApplePlayerControlsSectionProps } from '@/features/player/apple/controls/ApplePlayerControlTypes';
export { ApplePlayerNarrowHeader } from '@/features/player/apple/controls/ApplePlayerNarrowHeader';
export { ApplePlayerNarrowBottomControls } from '@/features/player/apple/controls/ApplePlayerNarrowBottomControls';

export default function ApplePlayerControlsSection({
    controlsRef,
    metadata,
    marqueeResetToken,
    onClose,
    push,
    toggleFavorite,
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
}: ApplePlayerControlsSectionProps) {
    const { canNavigate, handleOpenArtist, handleOpenAlbum } = useApplePlayerNavigation({ metadata, onClose, push });

    return (
        <div
            ref={controlsRef}
            className="flex flex-col gap-2 flex-shrink-0 transition-[width] duration-0 ease-linear"
            style={{ width: '100%' }}
        >
            <div className="flex items-center justify-between px-0.5 mt-2">
                <div className="flex flex-col min-w-0 pr-4 w-[75%]">
                    <OverflowMarquee
                        resetToken={`title-${marqueeResetToken}-${metadata?.path || metadata?.title || 'empty'}`}
                        behavior="auto-then-hover"
                        className="text-[clamp(0.875rem,2.8vmin,1.75rem)] font-bold text-white drop-shadow-md leading-tight"
                    >
                        <h1 className="whitespace-nowrap">
                            {metadata?.title || '未播放音乐'}
                        </h1>
                    </OverflowMarquee>
                    <OverflowMarquee
                        resetToken={`meta-${marqueeResetToken}-${metadata?.path || metadata?.artist || 'empty'}`}
                        behavior="auto-then-hover"
                        className="mt-1 text-[clamp(0.75rem,2vmin,1.25rem)] font-medium leading-tight text-white/60"
                        contentClassName="flex w-max items-center gap-1 whitespace-nowrap"
                    >
                        <span
                            onClick={(e) => {
                                e.stopPropagation();
                                handleOpenArtist();
                            }}
                            className={clsx(
                                'transition-colors',
                                canNavigate
                                    ? 'hover:underline hover:text-white/80 cursor-pointer'
                                    : 'cursor-default'
                            )}
                            role={canNavigate ? 'button' : undefined}
                        >
                            {metadata?.artist || 'Simple Player'}
                        </span>
                        {metadata?.album && (
                            <>
                                <span>—</span>
                                <span
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenAlbum();
                                    }}
                                    className={clsx(
                                        'transition-colors',
                                        canNavigate
                                            ? 'hover:underline hover:text-white/80 cursor-pointer'
                                            : 'cursor-default'
                                    )}
                                    role={canNavigate ? 'button' : undefined}
                                >
                                    {metadata.album}
                                </span>
                            </>
                        )}
                    </OverflowMarquee>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={() => {
                            if (metadata && typeof metadata.id === 'number') {
                                toggleFavorite(metadata);
                            }
                        }}
                        disabled={!metadata || typeof metadata.id !== 'number'}
                        className={clsx(
                            'w-[clamp(1.5rem,3.8vmin,2.25rem)] h-[clamp(1.5rem,3.8vmin,2.25rem)] flex-shrink-0 rounded-full flex items-center justify-center transition-all backdrop-blur-md',
                            metadata && typeof metadata.id === 'number'
                                ? 'bg-white/10 ring-1 ring-white/10 hover:bg-white/20 text-white/50 hover:text-red-500 cursor-pointer'
                                : 'bg-white/5 ring-1 ring-white/5 text-white/20 cursor-default'
                        )}
                    >
                        {metadata?.is_favorite ? <IoStar className="w-[60%] h-[60%] text-red-500" /> : <IoStarOutline className="w-[60%] h-[60%]" />}
                    </button>

                    <PlayerMenuWrapper metadata={metadata} onClose={onClose} />
                </div>
            </div>

            <div className="flex flex-col gap-1.5 mt-2">
                <MusicSlider
                    value={currentTime}
                    min={0}
                    max={metadata?.duration || 0}
                    disabled={!metadata}
                    onChange={handleSeekChange}
                    onMouseDown={handleSeekStart}
                    onMouseUp={handleSeekEnd}
                    trackHeightClass="h-[clamp(4px,1vmin,8px)]"
                    hoverHeightClass="group-hover:h-[clamp(7px,1.75vmin,14px)]"
                    activeHeightClass="group-active:h-[clamp(8px,2vmin,16px)]"
                />
                <div className="flex justify-between text-[11px] font-medium text-white/40 select-none">
                    <span>{formatTime(currentTime)}</span>
                    <span>-{formatTime(Math.max(0, Math.floor(metadata?.duration || 0) - Math.floor(currentTime)))}</span>
                </div>
            </div>

            <div className="flex items-center justify-between mt-[2%] w-full">
                <button
                    onClick={toggleShuffle}
                    className={clsx(
                        'w-[11.25%] flex-shrink-0 aspect-square max-w-[40px] flex items-center justify-center rounded-lg transition-colors hover:bg-white/10',
                        isShuffling ? 'text-primary' : 'text-white/40 hover:text-white'
                    )}
                >
                    <IoShuffle className="w-[60%] h-[60%]" />
                </button>

                <button onClick={playPrev} className="w-[13.5%] flex-shrink-0 aspect-square max-w-[48px] flex items-center justify-center text-white hover:scale-105 transition-all">
                    <IoPlayBack className="w-[70%] h-[70%]" />
                </button>

                <button
                    onClick={togglePlay}
                    className="flex-shrink-0 w-[18%] max-w-[64px] aspect-square rounded-full bg-transparent text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all overflow-hidden"
                >
                    {isPlaying ? <IoPause className="w-[75%] h-[75%]" /> : <IoPlay className="w-[75%] h-[75%] ml-[4%]" />}
                </button>

                <button onClick={playNext} className="w-[13.5%] flex-shrink-0 aspect-square max-w-[48px] flex items-center justify-center text-white hover:scale-105 transition-all">
                    <IoPlayForward className="w-[70%] h-[70%]" />
                </button>

                <button
                    onClick={toggleRepeat}
                    className={clsx(
                        'w-[11.25%] flex-shrink-0 aspect-square max-w-[40px] flex items-center justify-center rounded-lg transition-colors relative hover:bg-white/10',
                        repeatMode !== 'off' ? 'text-primary' : 'text-white/40 hover:text-white'
                    )}
                >
                    {repeatMode === 'one' ? (
                        <div className="relative w-full h-full flex items-center justify-center">
                            <IoRepeat className="w-[60%] h-[60%]" />
                            <span className="absolute top-[18%] right-[18%] text-[8px] font-bold">1</span>
                        </div>
                    ) : (
                        <IoRepeat className="w-[60%] h-[60%]" />
                    )}
                </button>
            </div>

            <div className="flex items-center gap-3 mt-6 px-1">
                {(() => {
                    if (localVolume === 0) return <IoVolumeOff className="text-white/40 text-xs" />;
                    if (localVolume <= 33) return <IoVolumeLow className="text-white/40 text-xs" />;
                    if (localVolume <= 66) return <IoVolumeMedium className="text-white/40 text-xs" />;
                    return <IoVolumeHigh className="text-white/40 text-xs" />;
                })()}
                <MusicSlider
                    value={localVolume}
                    min={0}
                    max={100}
                    onChange={handleVolumeChange}
                    onMouseDown={handleVolumeSeekStart}
                    onMouseUp={handleVolumeSeekEnd}
                    trackHeightClass="h-[clamp(3px,0.75vmin,6px)]"
                    hoverHeightClass="group-hover:h-[clamp(5px,1.25vmin,10px)]"
                    activeHeightClass="group-active:h-[clamp(6px,1.5vmin,12px)]"
                    className="flex-1"
                />
                <IoVolumeHigh className="text-white/40 text-xs" />
            </div>
        </div>
    );
}
