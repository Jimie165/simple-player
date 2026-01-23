import clsx from 'clsx';
import { memo } from 'react';

interface EqualizerProps {
    isPlaying: boolean;
    className?: string; // Color customization
}

const Equalizer = memo(({ isPlaying, className }: EqualizerProps) => {
    return (
        <div className="flex gap-[2px] items-end justify-center w-3 h-3">
            {/* Bar 1 */}
            <span
                className={clsx(
                    "w-[3px] rounded-full transition-all duration-300",
                    className || "bg-primary dark:bg-primary-container",
                    isPlaying ? "animate-[equalizer-jump_0.6s_ease-in-out_infinite]" : "h-[3px]"
                )}
                style={{ animationDelay: '0s' }}
            />
            {/* Bar 2 */}
            <span
                className={clsx(
                    "w-[3px] rounded-full transition-all duration-300",
                    className || "bg-primary dark:bg-primary-container",
                    isPlaying ? "animate-[equalizer-jump_0.6s_ease-in-out_infinite]" : "h-[3px]"
                )}
                style={{ animationDelay: '0.2s' }}
            />
            {/* Bar 3 */}
            <span
                className={clsx(
                    "w-[3px] rounded-full transition-all duration-300",
                    className || "bg-primary dark:bg-primary-container",
                    isPlaying ? "animate-[equalizer-jump_0.6s_ease-in-out_infinite]" : "h-[3px]"
                )}
                style={{ animationDelay: '0.4s' }}
            />
        </div>
    );
});

export default Equalizer;
