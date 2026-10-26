import clsx from 'clsx';
import {
    MdPauseCircle,
    MdPlayCircle,
    MdRepeat,
    MdShuffle,
    MdSkipNext,
    MdSkipPrevious,
} from 'react-icons/md';
import CustomTooltip from '@/components/common/CustomTooltip';
import type { SongMetadata } from '@/types';

interface PlaybackControlButtonsProps {
    isMini: boolean;
    metadata: SongMetadata | null;
    isPlaying: boolean;
    isShuffling: boolean;
    repeatMode: 'off' | 'all' | 'one';
    togglePlay: () => void;
    handlePrev: () => void;
    handleNext: () => void;
    handleBtnShuffle: () => void;
    handleBtnRepeat: () => void;
}

export function PlaybackControlButtons({
    isMini,
    metadata,
    isPlaying,
    isShuffling,
    repeatMode,
    togglePlay,
    handlePrev,
    handleNext,
    handleBtnShuffle,
    handleBtnRepeat,
}: PlaybackControlButtonsProps) {
    return (
        <div className={clsx(
            "relative z-10 row-start-1 flex min-w-0 items-center gap-1.5",
            isMini ? "col-start-2 justify-end gap-2" : "col-start-1 justify-center"
        )}>
            <div className={clsx(isMini && "hidden")}>
                <CustomTooltip text={"随机播放"}>
                    <button
                        onClick={handleBtnShuffle}
                        className={clsx(
                            "grid h-7 w-7 place-items-center rounded-full text-[17px] transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                            isShuffling
                                ? "text-primary"
                                : "text-neutral-700 dark:text-white/70"
                        )}
                    >
                        <MdShuffle />
                    </button>
                </CustomTooltip>
            </div>

            <CustomTooltip text="上一首">
                <button onClick={handlePrev} className={clsx(
                    "grid h-7 w-7 place-items-center rounded-full text-[23px] text-neutral-900 transition-all hover:bg-black/5 active:scale-90 dark:text-white/88 dark:hover:bg-white/10",
                    isMini && "hidden"
                )}>
                    <MdSkipPrevious />
                </button>
            </CustomTooltip>

            <CustomTooltip text={!metadata ? "没有歌曲" : (isPlaying ? "暂停" : "播放")}>
                <button
                    onClick={metadata ? togglePlay : undefined}
                    disabled={!metadata}
                    className={clsx(
                        "grid place-items-center rounded-full transition-all active:scale-95",
                        isMini ? "h-11 w-11 text-[44px]" : "h-8 w-8 text-[32px]",
                        metadata
                            ? "cursor-pointer text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:text-primary/90 hover:scale-[1.04]"
                            : "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
                    )}
                >
                    {isPlaying ? <MdPauseCircle /> : <MdPlayCircle />}
                </button>
            </CustomTooltip>

            <CustomTooltip text="下一首">
                <button onClick={handleNext} className={clsx(
                    "grid place-items-center rounded-full text-neutral-900 transition-all hover:bg-black/5 active:scale-90 dark:text-white/88 dark:hover:bg-white/10",
                    isMini ? "h-10 w-10 text-[34px]" : "h-7 w-7 text-[23px]"
                )}>
                    <MdSkipNext />
                </button>
            </CustomTooltip>

            <div className={clsx(isMini && "hidden")}>
                <CustomTooltip text={
                    repeatMode === 'off' ? "重复播放已关闭" :
                        repeatMode === 'all' ? "重复播放全部" : "单曲循环"
                }>
                    <button
                        onClick={handleBtnRepeat}
                        className={clsx(
                            "relative grid h-7 w-7 place-items-center rounded-full text-[17px] transition-colors hover:bg-black/5 dark:hover:bg-white/10",
                            repeatMode !== 'off'
                                ? "text-primary"
                                : "text-neutral-700 dark:text-white/70"
                        )}
                    >
                        {repeatMode === 'one' ? (
                            <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                <path d="M7 7h5v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm1.7-14.5h1.8v7h-1.8V4.1l-1.5 1V3.6l1.5-1.1z" />
                            </svg>
                        ) : (
                            <MdRepeat />
                        )}
                    </button>
                </CustomTooltip>
            </div>
        </div>
    );
}
