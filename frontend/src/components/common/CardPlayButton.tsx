import { MdPlayArrow } from 'react-icons/md';
import CustomTooltip from '@/components/common/CustomTooltip';

interface CardPlayButtonProps {
    onClick: (e: React.MouseEvent) => void;
    variant?: 'glass' | 'cover';
    className?: string; // Allow custom positioning if needed
}

export default function CardPlayButton({ onClick, className, variant = 'glass' }: CardPlayButtonProps) {
    return (
        <CustomTooltip
            text="播放"
            className={`absolute bottom-3 left-3 z-10 ${className || ''}`}
        >
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onClick(e);
                }}
                aria-label="播放"
                className={variant === 'cover' ? 'cover-card-button' : "w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 shadow-lg flex items-center justify-center text-white hover:bg-white/30 hover:scale-110 active:scale-95 transition-all duration-200"}
            >
                {variant === 'cover' ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M6 4.8c0-1.4 1.5-2.2 2.7-1.5l12 7.2a1.75 1.75 0 0 1 0 3l-12 7.2C7.5 21.4 6 20.6 6 19.2Z" />
                    </svg>
                ) : <MdPlayArrow className="translate-x-0.5" />}
            </button>
        </CustomTooltip>
    );
}
