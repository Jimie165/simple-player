import clsx from 'clsx';
import { memo } from 'react';

interface EqualizerProps {
    isPlaying: boolean;
    className?: string; // Color customization
}

const Equalizer = memo(({ isPlaying, className }: EqualizerProps) => {
    return (
        <div className="flex gap-[2px] items-end justify-center w-auto h-3">
            <span
                className={clsx(
                    "w-[3px] rounded-full transition-colors duration-300",
                    className || "bg-primary dark:bg-primary-container",
                    isPlaying ? "animate-[equalizer-jump_0.6s_ease-in-out_infinite]" : "h-[3px]"
                )}
                style={{ animationDelay: '0s' }}
            />
            <span
                className={clsx(
                    "w-[3px] rounded-full transition-colors duration-300",
                    className || "bg-primary dark:bg-primary-container",
                    isPlaying ? "animate-[equalizer-jump_0.6s_ease-in-out_infinite]" : "h-[3px]"
                )}
                style={{ animationDelay: '0.2s' }}
            />
            <span
                className={clsx(
                    "w-[3px] rounded-full transition-colors duration-300",
                    className || "bg-primary dark:bg-primary-container",
                    isPlaying ? "animate-[equalizer-jump_0.6s_ease-in-out_infinite]" : "h-[3px]"
                )}
                style={{ animationDelay: '0.4s' }}
            />
            <span
                className={clsx(
                    "w-[3px] rounded-full transition-colors duration-300",
                    className || "bg-primary dark:bg-primary-container",
                    isPlaying ? "animate-[equalizer-jump_0.6s_ease-in-out_infinite]" : "h-[3px]"
                )}
                style={{ animationDelay: '0.15s' }}
            />
        </div>
    );
});

export default Equalizer;
