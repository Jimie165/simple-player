import NowPlayingStarIcon from '@/features/player/now-playing/controls/NowPlayingStarIcon';
import clsx from 'clsx';
import OverflowMarquee from '@/components/common/OverflowMarquee';
import { PlayerMenuWrapper } from '@/features/player/now-playing/controls/PlayerMenuButton';
import type { NowPlayingControlsSectionProps } from '@/features/player/now-playing/controls/NowPlayingControlTypes';
import { useNowPlayingNavigation } from '@/features/player/now-playing/controls/useNowPlayingNavigation';

export function NowPlayingNarrowHeader({
    metadata,
    marqueeResetToken,
    onClose,
    push,
    toggleFavorite,
}: Pick<NowPlayingControlsSectionProps, 'metadata' | 'marqueeResetToken' | 'onClose' | 'push' | 'toggleFavorite'>) {
    const { canNavigate, handleOpenArtist, handleOpenAlbum } = useNowPlayingNavigation({ metadata, onClose, push });

    return (
        <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col min-w-0 flex-1">
                <OverflowMarquee
                    resetToken={`narrow-title-${marqueeResetToken}-${metadata?.path || metadata?.title || 'empty'}`}
                    behavior="auto-then-hover"
                    className="text-[clamp(0.85rem,3.8vw,1.1rem)] font-bold text-white leading-tight"
                >
                    <h1 className="whitespace-nowrap">
                        {metadata?.title || '未播放音乐'}
                    </h1>
                </OverflowMarquee>
                <OverflowMarquee
                    resetToken={`narrow-meta-${marqueeResetToken}-${metadata?.path || metadata?.artist || 'empty'}`}
                    behavior="auto-then-hover"
                    className="mt-1 text-[clamp(0.72rem,3vw,0.85rem)] font-medium leading-tight text-white/65"
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
                                ? 'hover:underline hover:text-white/85 cursor-pointer'
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
                                        ? 'hover:underline hover:text-white/85 cursor-pointer'
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

            <div className="flex items-center gap-2 shrink-0">
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
                        'w-[clamp(1.5rem,3.8vmin,2.25rem)] h-[clamp(1.5rem,3.8vmin,2.25rem)] shrink-0 rounded-full flex items-center justify-center text-white mix-blend-plus-lighter',
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
    );
}
