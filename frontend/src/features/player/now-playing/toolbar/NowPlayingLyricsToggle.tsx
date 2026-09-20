import clsx from 'clsx';
import NowPlayingToggleIcon from '@/features/player/now-playing/controls/NowPlayingToggleIcon';

interface NowPlayingLyricsToggleProps {
    isLyricsOpen: boolean;
    hasLyrics: boolean;
    onToggle: () => void;
}

export default function NowPlayingLyricsToggle({ isLyricsOpen, hasLyrics, onToggle }: NowPlayingLyricsToggleProps) {
    const isDisabled = !hasLyrics;

    return (
        <div>
            <button
                type="button"
                onClick={() => {
                    if (!isDisabled) onToggle();
                }}
                aria-disabled={isDisabled}
                style={{
                    width: 'clamp(1.92rem,3.67vw,2.58rem)',
                    height: 'clamp(1.92rem,3.67vw,2.58rem)',
                    borderRadius: 'clamp(0.5rem,0.95vw,0.72rem)'
                }}
                className={clsx(
                    'flex items-center justify-center text-white transition-opacity',
                    isDisabled
                        ? 'opacity-45 cursor-not-allowed'
                        : 'opacity-100 group/toggle [&:hover>svg[data-selected=false]]:opacity-60'
                )}
            >
                <NowPlayingToggleIcon selected={isLyricsOpen} icon="lyrics" />
            </button>
        </div>
    );
}
