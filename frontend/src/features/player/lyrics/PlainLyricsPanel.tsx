import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { LyricsDocument } from '@/types';
import LyricsScrollbar from '@/features/player/scrollbar/LyricsScrollbar';

interface PlainLyricsPanelProps {
    lyricsDocument: LyricsDocument | null;
    coverShellRef?: RefObject<HTMLDivElement | null>;
    status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    variant?: 'side' | 'narrow';
    narrowControlsVisible?: boolean;
}

export default function PlainLyricsPanel({ lyricsDocument, status, coverShellRef, variant = 'side', narrowControlsVisible = true }: PlainLyricsPanelProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [topInset, setTopInset] = useState(8);
    useLayoutEffect(() => {
        const cover = coverShellRef?.current;
        const panel = containerRef.current?.closest('[data-lyrics-panel]');
        if (!cover || !panel) return;
        const update = () => setTopInset(Math.max(0, cover.getBoundingClientRect().top - panel.getBoundingClientRect().top));
        update();
        const observer = new ResizeObserver(update);
        observer.observe(cover);
        observer.observe(panel);
        if (cover.parentElement) observer.observe(cover.parentElement);
        window.addEventListener('resize', update);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [coverShellRef, status]);

    const displayState = status === 'loading'
        ? '正在加载歌词...'
        : status === 'error'
            ? '歌词读取失败'
            : status === 'empty'
                ? '此歌曲无歌词'
                : !lyricsDocument?.lines.length
                    ? '暂无歌词'
                    : null;

    if (displayState) {
        return <div className="flex h-full items-center justify-center text-sm text-white/40">{displayState}</div>;
    }

    const displayLines = (lyricsDocument?.lines ?? []).flatMap((line) =>
        line.text.replace(/\r\n?/g, '\n').split('\n')
    );

    const viewportTop = Math.max(0, topInset - 48);
    const contentTop = topInset - viewportTop;
    const maskImage = variant === 'narrow' && narrowControlsVisible
        ? 'linear-gradient(to bottom, rgba(0, 0, 0, var(--plain-lyrics-top-alpha, 1)), black 32px, black calc(100% - 18rem), transparent calc(100% - 14.5rem))'
        : 'linear-gradient(to bottom, rgba(0, 0, 0, var(--plain-lyrics-top-alpha, 1)), black 32px, black calc(100% - clamp(8rem, 20vh, 14rem)), rgba(0, 0, 0, 0.5) calc(100% - clamp(4rem, 10vh, 7rem)), transparent calc(100% - 1rem))';

    return (
        <div ref={containerRef} className="relative h-full w-full overflow-hidden">
            <div
                ref={viewportRef}
                className="plain-lyrics-scroll overflow-y-auto wrap-break-word pl-[clamp(1.2rem,2.2vw,2rem)] pr-[clamp(1.7rem,3vw,2.9rem)] text-left font-bold text-[clamp(1.125rem,2.35vmin,1.5rem)] leading-[1.65] text-white"
                onScroll={event => {
                    const viewport = event.currentTarget;
                    containerRef.current?.style.setProperty('--plain-lyrics-top-alpha', String(1 - Math.min(1, Math.max(0, viewport.scrollTop) / 32)));
                }}
                style={{
                    marginTop: viewportTop,
                    height: `calc(100% - ${viewportTop}px)`,
                    maskImage,
                    WebkitMaskImage: maskImage,
                    clipPath: variant === 'narrow' && narrowControlsVisible ? 'inset(0 0 min(14.5rem, 100%) 0)' : undefined,
                }}
            >
                <div className="pb-24" style={{
                    paddingTop: contentTop,
                    paddingBottom: variant === 'narrow' && narrowControlsVisible ? '18rem' : undefined,
                }}>
                    {displayLines.map((line, index) => (
                        <div
                            key={index}
                            className="whitespace-pre-wrap"
                            style={{ minHeight: '1.65em' }}
                        >
                            {line}
                        </div>
                    ))}
                </div>
            </div>
            <LyricsScrollbar viewportRef={viewportRef} style={variant === 'narrow' ? {
                top: viewportTop,
                bottom: narrowControlsVisible ? '18rem' : '1.5rem',
                transition: 'bottom 300ms ease-out, opacity 250ms ease',
            } : { top: viewportTop, maskImage, WebkitMaskImage: maskImage }} />
        </div>
    );
}
