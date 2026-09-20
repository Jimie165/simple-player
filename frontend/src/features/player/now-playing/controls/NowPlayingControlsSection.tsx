import NowPlayingStarIcon from '@/features/player/now-playing/controls/NowPlayingStarIcon';
import clsx from 'clsx';
import NowPlayingTransportIcon from '@/features/player/now-playing/controls/NowPlayingTransportIcon';
import NowPlayingToggleIcon from '@/features/player/now-playing/controls/NowPlayingToggleIcon';
import {
    IoVolumeOff,
    IoVolumeLow,
    IoVolumeMedium,
    IoVolumeHigh,
} from 'react-icons/io5';
import MusicSlider from '@/components/common/MusicSlider';
import { PlayerMenuWrapper } from '@/features/player/now-playing/controls/PlayerMenuButton';
import OverflowMarquee from '@/components/common/OverflowMarquee';
import type { NowPlayingControlsSectionProps } from '@/features/player/now-playing/controls/NowPlayingControlTypes';
import { useNowPlayingNavigation } from '@/features/player/now-playing/controls/useNowPlayingNavigation';
import NowPlayingProgress from '@/features/player/now-playing/controls/NowPlayingProgress';

export type { NowPlayingControlsSectionProps } from '@/features/player/now-playing/controls/NowPlayingControlTypes';
export { NowPlayingNarrowHeader } from '@/features/player/now-playing/controls/NowPlayingNarrowHeader';
export { NowPlayingNarrowBottomControls } from '@/features/player/now-playing/controls/NowPlayingNarrowBottomControls';

export default function NowPlayingControlsSection({
    controlsRef,
    metadata,
    marqueeResetToken,
    onClose,
    push,
    toggleFavorite,
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
}: NowPlayingControlsSectionProps) {
    const { canNavigate, handleOpenArtist, handleOpenAlbum } = useNowPlayingNavigation({ metadata, onClose, push });

    return (
        <div
            ref={controlsRef}
            className="flex flex-col gap-2 shrink-0 transition-[width] duration-0 ease-linear"
            style={{ width: '100%' }}
        >
            {/* 文字采用普通合成，避免加亮混合抬高字缘亮度、损失笔画细节。 */}
            <div className="flex items-center justify-between px-0.5 mt-2">
                <div className="flex flex-col min-w-0 pr-4 w-[75%]">
                    <OverflowMarquee
                        resetToken={`title-${marqueeResetToken}-${metadata?.path || metadata?.title || 'empty'}`}
                        behavior="auto-then-hover"
                        className="text-[clamp(0.875rem,2.8vmin,1.75rem)] font-bold text-white leading-tight"
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
                <div className="flex items-center gap-2 shrink-0 mix-blend-plus-lighter">
                    <button
                        onClick={() => {
                            if (metadata && typeof metadata.id === 'number') {
                                toggleFavorite(metadata);
                            }
                        }}
                        aria-label={metadata?.is_favorite ? '取消收藏' : '收藏'}
                        aria-pressed={Boolean(metadata?.is_favorite)}
                        disabled={!metadata || typeof metadata.id !== 'number'}
                        className={clsx(
                            'w-[clamp(1.5rem,3.8vmin,2.25rem)] h-[clamp(1.5rem,3.8vmin,2.25rem)] shrink-0 rounded-full flex items-center justify-center text-white',
                            metadata && typeof metadata.id === 'number'
                                ? 'group/favorite cursor-pointer'
                                : 'opacity-30 cursor-default'
                        )}
                    >
                        <NowPlayingStarIcon selected={Boolean(metadata?.is_favorite)} />
                    </button>

                    <PlayerMenuWrapper metadata={metadata} onClose={onClose} />
                </div>
            </div>

            <div className="mt-2 mix-blend-plus-lighter">
                <NowPlayingProgress
                    metadata={metadata}
                    onChange={handleSeekChange}
                    onMouseDown={handleSeekStart}
                    onMouseUp={handleSeekEnd}
                    variant="standard"
                />
            </div>

            <div className="flex items-center justify-between mt-[2%] w-full">
                <button
                    onClick={toggleShuffle}
                    className={clsx(
                        'w-[11.25%] shrink-0 aspect-square max-w-10 flex items-center justify-center rounded-lg transition-opacity text-white mix-blend-plus-lighter group/toggle [&:hover>svg[data-selected=false]]:opacity-60'
                    )}
                >
                    <NowPlayingToggleIcon selected={isShuffling} icon="shuffle" />
                </button>

                <button onClick={playPrev} className="w-[13.5%] shrink-0 aspect-square max-w-12 flex items-center justify-center text-white hover:scale-105 transition-all">
                    <NowPlayingTransportIcon icon="previous" className="w-[70%] h-[70%]" />
                </button>

                <button
                    onClick={togglePlay}
                    className="shrink-0 w-[18%] max-w-16 aspect-square rounded-full bg-transparent text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all overflow-hidden"
                >
                    <NowPlayingTransportIcon icon={isPlaying ? 'pause' : 'play'} className={clsx('w-[75%] h-[75%]', !isPlaying && 'ml-[4%]')} />
                </button>

                <button onClick={playNext} className="w-[13.5%] shrink-0 aspect-square max-w-12 flex items-center justify-center text-white hover:scale-105 transition-all">
                    <NowPlayingTransportIcon icon="next" className="w-[70%] h-[70%]" />
                </button>

                <button
                    onClick={toggleRepeat}
                    className={clsx(
                        'w-[11.25%] shrink-0 aspect-square max-w-10 flex items-center justify-center rounded-lg transition-opacity relative text-white mix-blend-plus-lighter group/toggle [&:hover>svg[data-selected=false]]:opacity-60'
                    )}
                >
                    <NowPlayingToggleIcon selected={repeatMode !== 'off'} icon="repeat" repeatOne={repeatMode === 'one'} />
                </button>
            </div>

            <div className="flex items-center gap-3 mt-6 px-1 mix-blend-plus-lighter">
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
