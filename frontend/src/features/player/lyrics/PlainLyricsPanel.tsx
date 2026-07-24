import type { LyricsLine } from '@/types';

interface PlainLyricsPanelProps {
    lyrics: LyricsLine[] | null;
    status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
}

export default function PlainLyricsPanel({ lyrics, status }: PlainLyricsPanelProps) {
    const displayState = status === 'loading'
        ? '正在加载歌词...'
        : status === 'error'
            ? '歌词读取失败'
            : status === 'empty'
                ? '此歌曲无歌词'
                : !lyrics?.length
                    ? '暂无歌词'
                    : null;

    if (displayState) {
        return <div className="flex h-full items-center justify-center text-sm text-white/40">{displayState}</div>;
    }

    const displayLines = (lyrics ?? []).flatMap((line) =>
        line.text.replace(/\r\n?/g, '\n').split('\n')
    );

    return (
        <div className="h-full w-full overflow-hidden rounded-[22px]">
            <div
                className="h-full overflow-y-auto wrap-break-word pl-[clamp(1.2rem,2.2vw,2rem)] pr-[clamp(1.7rem,3vw,2.9rem)] text-left font-bold text-[clamp(1.68rem,4.5vmin,3.10rem)] leading-[1.38] tracking-wide text-white scrollbar-none [&::-webkit-scrollbar]:hidden"
            >
                <div className="py-16">
                    {displayLines.map((line, index) => (
                        <div
                            key={index}
                            className="whitespace-pre-wrap"
                            style={{ minHeight: '1.38em' }}
                        >
                            {line}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}