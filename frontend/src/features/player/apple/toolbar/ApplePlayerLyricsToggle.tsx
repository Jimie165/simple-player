import clsx from 'clsx';

interface ApplePlayerLyricsToggleProps {
    isLyricsOpen: boolean;
    hasLyrics: boolean;
    onToggle: () => void;
}

export default function ApplePlayerLyricsToggle({ isLyricsOpen, hasLyrics, onToggle }: ApplePlayerLyricsToggleProps) {
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
                    'flex items-center justify-center transition-all',
                    isDisabled
                        ? 'text-white/20 cursor-not-allowed'
                        : isLyricsOpen
                            ? 'bg-white/20 text-primary shadow-lg backdrop-blur-md'
                            : 'hover:bg-white/10 hover:text-white text-white/50 backdrop-blur-md'
                )}
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className={clsx('w-[clamp(1.05rem,2.0vw,1.45rem)] h-[clamp(1.05rem,2.0vw,1.45rem)]')}
                >
                    <path
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17 3.5C20.0376 3.5 22.5 5.96243 22.5 9V14C22.5 17.0376 20.0376 19.5 17 19.5H13.8L9.2 23.3C8.6 23.8 7.5 23.3 7.5 22.5V19.5H7C3.96243 19.5 1.5 17.0376 1.5 14V9C1.5 5.96243 3.96243 3.5 7 3.5H17Z"
                    />
                    <path
                        fill="currentColor"
                        d="M10.5 11.5V10.25C10.5 9.00736 9.49264 8 8.25 8C7.00736 8 6 9.00736 6 10.25C6 11.4926 7.00736 12.5 8.25 12.5H8.7C8.58 13.5 7.8 14 7 14V15.5C9.5 15.5 10.5 13.25 10.5 12.25V11.5ZM16.5 11.5V10.25C16.5 9.00736 15.4926 8 14.25 8C13.0074 8 12 9.00736 12 10.25C12 11.4926 13.0074 12.5 14.25 12.5H14.7C14.58 13.5 13.8 14 13 14V15.5C15.5 15.5 16.5 13.25 16.5 12.25V11.5Z"
                    />
                </svg>
            </button>
        </div>
    );
}
