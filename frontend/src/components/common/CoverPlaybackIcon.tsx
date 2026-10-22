import { IoPause, IoPlay } from 'react-icons/io5';

export default function CoverPlaybackIcon({ playing = false }: { playing?: boolean }) {
    const Icon = playing ? IoPause : IoPlay;
    return <Icon aria-hidden="true" className="text-[clamp(1rem,1.8vw,1.5rem)] text-white" />;
}
