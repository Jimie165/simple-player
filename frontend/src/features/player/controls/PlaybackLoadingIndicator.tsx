import clsx from 'clsx';

export default function PlaybackLoadingIndicator({ className }: { className?: string }) {
    return (
        <span role="progressbar" aria-label="正在加载音频" className={clsx('playback-progress-loading pointer-events-none absolute inset-0 overflow-hidden rounded-full', className)}>
            <span className="playback-progress-loading-segment absolute inset-y-0 left-0 rounded-full bg-current" />
            <span className="playback-progress-loading-segment playback-progress-loading-segment-next absolute inset-y-0 left-0 rounded-full bg-current" />
        </span>
    );
}
