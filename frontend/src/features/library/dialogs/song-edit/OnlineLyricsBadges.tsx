import { useEffect, useRef } from 'react';
import type { LyricsDocument } from '@/types';
import type { OnlineLyricsCandidate } from '@/services/onlineLyricsService';
import type { OnlineLyricsDetails } from '@/features/library/dialogs/song-edit/useOnlineLyricsDetails';

function onlineLyricsTags(format: string, document: LyricsDocument): string[] {
    return [
        format === 'ttml' ? 'TTML' : document.timing_mode === 'word' ? '逐字' : document.timing_mode === 'line' ? '逐行' : '纯文本',
        ...(document.lines.some(line => line.translation?.trim() || line.backgroundLine?.translation?.trim()) ? ['翻译'] : []),
        ...(document.lines.some(line => line.romanization?.trim() || line.backgroundLine?.romanization?.trim()) ? ['音译'] : []),
    ];
}

export function OnlineLyricsBadges({ details }: { details: OnlineLyricsDetails }) {
    return <span className="flex flex-wrap gap-1.5">{onlineLyricsTags(details.format, details.document).map(tag => <span key={tag} className="rounded-full border border-primary/60 px-2 py-0.5 text-xs font-normal leading-4 text-primary">{tag}</span>)}</span>;
}

export function OnlineLyricsResultBadges({ candidate, details, load }: {
    candidate: OnlineLyricsCandidate;
    details: OnlineLyricsDetails | null | undefined;
    load: (candidate: OnlineLyricsCandidate) => Promise<OnlineLyricsDetails>;
}) {
    const element = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (details !== undefined || !element.current) return;
        const observer = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            observer.disconnect();
            void load(candidate).catch(() => undefined);
        });
        observer.observe(element.current);
        return () => observer.disconnect();
    }, [candidate, details, load]);
    return <span ref={element} className="mt-2 block min-h-6">{details ? <OnlineLyricsBadges details={details} /> : <span className="text-xs text-neutral-500">{details === null ? '歌词信息暂不可用' : '正在读取歌词信息…'}</span>}</span>;
}
