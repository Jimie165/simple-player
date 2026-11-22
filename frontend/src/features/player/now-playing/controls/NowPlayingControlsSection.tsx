import VolumeIcon from '@/components/common/VolumeIcon';
import NowPlayingStarIcon from '@/features/player/now-playing/controls/NowPlayingStarIcon';
import clsx from 'clsx';
import NowPlayingTransportIcon from '@/features/player/now-playing/controls/NowPlayingTransportIcon';
import NowPlayingToggleIcon from '@/features/player/now-playing/controls/NowPlayingToggleIcon';
import MusicSlider from '@/components/common/MusicSlider';
import { PlayerMenuWrapper } from '@/features/player/now-playing/controls/PlayerMenuButton';
import OverflowMarquee from '@/components/common/OverflowMarquee';
import type { NowPlayingControlsSectionProps } from '@/features/player/now-playing/controls/NowPlayingControlTypes';
import { useNowPlayingNavigation } from '@/features/player/now-playing/controls/useNowPlayingNavigation';
import NowPlayingProgress from '@/features/player/now-playing/controls/NowPlayingProgress';
import { NOW_PLAYING_SLIDER_SIZE } from '@/features/player/now-playing/controls/nowPlayingSliderSize';

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
            <div className="flex items-center justify-between px-0.5 mt-2">
                <div className="flex flex-col min-w-0 flex-1 pr-[clamp(0.125rem,0.3vmin,0.25rem)]">
                    <OverflowMarquee
                        resetToken={`title-${marqueeResetToken}-${metadata?.path || metadata?.title || 'empty'}`}
                        behavior="auto-then-hover"
                        className="text-(length:--np-title-size) font-bold text-white leading-tight"
                    >
                        <h1 className="whitespace-nowrap">
                            {metadata?.title || '未播放音乐'}
                        </h1>
                    </OverflowMarquee>
                    <OverflowMarquee
                        resetToken={`meta-${marqueeResetToken}-${metadata?.path || metadata?.artist || 'empty'}`}
                        behavior="auto-then-hover"
                        className="mt-1 text-(length:--np-meta-size) font-medium leading-tight text-white opacity-45 mix-blend-plus-lighter"
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
                                    ? 'hover:underline hover:opacity-75 active:opacity-50 cursor-pointer'
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
                                            ? 'hover:underline hover:opacity-75 active:opacity-50 cursor-pointer'
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
                                void (toggleFavorite(metadata)).catch(console.error);
                            }
                        }}
                        aria-label={metadata?.is_favorite ? '取消收藏' : '收藏'}
                        aria-pressed={Boolean(metadata?.is_favorite)}
                        disabled={!metadata || typeof metadata.id !== 'number'}
                        className={clsx(
                            'size-[max(1.5rem,calc(var(--np-control-base)*0.075))] shrink-0 rounded-full flex items-center justify-center text-white',
                            metadata && typeof metadata.id === 'number'
                                ? 'group/favorite cursor-pointer'
                                : 'opacity-30 cursor-default'
                        )}
                    >
                        <NowPlayingStarIcon selected={Boolean(metadata?.is_favorite)} />
                    </button>

                    <PlayerMenuWrapper
                        metadata={metadata}
                        onClose={onClose}
                        sizeClassName="size-[max(1.5rem,calc(var(--np-control-base)*0.075))]"
                    />
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
                        'size-[calc(var(--np-control-base)*0.12)] shrink-0 flex items-center justify-center rounded-lg transition-opacity text-white mix-blend-plus-lighter group/toggle [&:hover>svg[data-selected=false]]:opacity-60'
                    )}
                >
                    <NowPlayingToggleIcon selected={isShuffling} icon="shuffle" />
                </button>

                <button onClick={playPrev} className="size-[calc(var(--np-control-base)*0.135)] shrink-0 flex items-center justify-center text-white hover:scale-105 transition-all">
                    <NowPlayingTransportIcon icon="previous" className="w-[70%] h-[70%]" />
                </button>

                <button
                    onClick={togglePlay}
                    className="shrink-0 size-[calc(var(--np-control-base)*0.18)] rounded-full bg-transparent text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all overflow-hidden"
                >
                    <NowPlayingTransportIcon icon={isPlaying ? 'pause' : 'play'} className={clsx('w-[75%] h-[75%]', !isPlaying && 'ml-[4%]')} />
                </button>

                <button onClick={playNext} className="size-[calc(var(--np-control-base)*0.135)] shrink-0 flex items-center justify-center text-white hover:scale-105 transition-all">
                    <NowPlayingTransportIcon icon="next" className="w-[70%] h-[70%]" />
                </button>

                <button
                    onClick={toggleRepeat}
                    className={clsx(
                        'size-[calc(var(--np-control-base)*0.12)] shrink-0 flex items-center justify-center rounded-lg transition-opacity relative text-white mix-blend-plus-lighter group/toggle [&:hover>svg[data-selected=false]]:opacity-60'
                    )}
                >
                    <NowPlayingToggleIcon selected={repeatMode !== 'off'} icon="repeat" repeatOne={repeatMode === 'one'} />
                </button>
            </div>

            {/* 音量图标与播放控制区共用 --np-control-base 缩放基准。 */}
            <div data-player-volume className="flex items-center gap-3 mt-6 px-1 mix-blend-plus-lighter">
                <VolumeIcon
                    volume={localVolume}
                    className="text-white/40 text-[max(0.875rem,calc(var(--np-control-base)*0.05))]"
                />
                <MusicSlider
                    value={localVolume}
                    min={0}
                    max={100}
                    onChange={handleVolumeChange}
                    onMouseDown={handleVolumeSeekStart}
                    onMouseUp={handleVolumeSeekEnd}
                    {...NOW_PLAYING_SLIDER_SIZE}
                    className="flex-1"
                />
                <VolumeIcon className="text-white/40 text-[max(0.875rem,calc(var(--np-control-base)*0.05))]" />
            </div>
        </div>
    );
}
