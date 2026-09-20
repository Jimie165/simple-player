import NowPlayingToggleIcon from '@/features/player/now-playing/controls/NowPlayingToggleIcon';

interface NowPlayingQueueToggleProps {
    isQueueOpen: boolean;
    onToggle: () => void;
}

export default function NowPlayingQueueToggle({ isQueueOpen, onToggle }: NowPlayingQueueToggleProps) {
    return (
        <button
            onClick={onToggle}
            style={{
                width: 'clamp(1.92rem,3.67vw,2.58rem)',
                height: 'clamp(1.92rem,3.67vw,2.58rem)',
                borderRadius: 'clamp(0.5rem,0.95vw,0.72rem)'
            }}
            className="flex items-center justify-center text-white group/toggle [&:hover>svg[data-selected=false]]:opacity-60 transition-opacity"
        >
            <NowPlayingToggleIcon selected={isQueueOpen} icon="queue" />
        </button>
    );
}
