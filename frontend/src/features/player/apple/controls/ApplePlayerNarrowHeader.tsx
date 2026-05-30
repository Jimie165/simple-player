import clsx from 'clsx';
import { IoStar, IoStarOutline } from 'react-icons/io5';
import OverflowMarquee from '@/components/common/OverflowMarquee';
import { PlayerMenuWrapper } from '@/features/player/apple/controls/PlayerMenuButton';
import type { ApplePlayerControlsSectionProps } from '@/features/player/apple/controls/ApplePlayerControlTypes';
import { useApplePlayerNavigation } from '@/features/player/apple/controls/useApplePlayerNavigation';

export function ApplePlayerNarrowHeader({
    metadata,
    marqueeResetToken,
    onClose,
    push,
    toggleFavorite,
}: Pick<ApplePlayerControlsSectionProps, 'metadata' | 'marqueeResetToken' | 'onClose' | 'push' | 'toggleFavorite'>) {
    const { canNavigate, handleOpenArtist, handleOpenAlbum } = useApplePlayerNavigation({ metadata, onClose, push });

    return (
        <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col min-w-0 flex-1">
                <OverflowMarquee
                    resetToken={`narrow-title-${marqueeResetToken}-${metadata?.path || metadata?.title || 'empty'}`}
                    behavior="auto-then-hover"
                    className="text-[clamp(0.85rem,3.8vw,1.1rem)] font-bold text-white drop-shadow-md leading-tight"
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
                            ? 'bg-white/12 ring-1 ring-white/10 hover:bg-white/20 text-white/60 hover:text-red-500 cursor-pointer'
                            : 'bg-white/5 ring-1 ring-white/5 text-white/20 cursor-default'
                    )}
                >
                    {metadata?.is_favorite ? <IoStar className="w-[60%] h-[60%] text-red-500" /> : <IoStarOutline className="w-[60%] h-[60%]" />}
                </button>
                <PlayerMenuWrapper metadata={metadata} onClose={onClose} />
            </div>
        </div>
    );
}
