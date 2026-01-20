import { IoPlay } from 'react-icons/io5';

interface CardPlayButtonProps {
    onClick: (e: React.MouseEvent) => void;
    title?: string;
    className?: string; // Allow custom positioning if needed
}

export default function CardPlayButton({ onClick, title = "播放", className }: CardPlayButtonProps) {
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onClick(e);
            }}
            className={`absolute bottom-3 left-3 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 shadow-lg flex items-center justify-center text-white hover:bg-white/30 hover:scale-110 active:scale-95 transition-all duration-200 z-10 ${className || ''}`}
            title={title}
        >
            <IoPlay className="translate-x-0.5" />
        </button>
    );
}
