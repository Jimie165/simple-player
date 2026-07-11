import { MdPlayArrow } from 'react-icons/md';
import CustomTooltip from '@/components/common/CustomTooltip';

interface CardPlayButtonProps {
    onClick: (e: React.MouseEvent) => void;
    title?: string;
    className?: string; // Allow custom positioning if needed
}

export default function CardPlayButton({ onClick, title = "播放", className }: CardPlayButtonProps) {
    return (
        <CustomTooltip
            text={title}
            className={`absolute bottom-3 left-3 z-10 ${className || ''}`}
        >
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onClick(e);
                }}
                aria-label={title}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 shadow-lg flex items-center justify-center text-white hover:bg-white/30 hover:scale-110 active:scale-95 transition-all duration-200"
            >
                <MdPlayArrow className="translate-x-0.5" />
            </button>
        </CustomTooltip>
    );
}
