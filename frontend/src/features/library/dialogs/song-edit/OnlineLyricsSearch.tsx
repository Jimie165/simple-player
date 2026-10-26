import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MdArrowBack, MdChevronRight, MdClose, MdSearch } from 'react-icons/md';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { lyricsProviders, onlineLyricsService, orderedLyricsProviders } from '@/services/onlineLyricsService';
import type { OnlineLyricsCandidate } from '@/services/onlineLyricsService';
import { lyricsCandidateKey, useOnlineLyricsDetails } from '@/features/library/dialogs/song-edit/useOnlineLyricsDetails';
import type { OnlineLyricsDetails } from '@/features/library/dialogs/song-edit/useOnlineLyricsDetails';
import { OnlineLyricsBadges, OnlineLyricsResultBadges } from '@/features/library/dialogs/song-edit/OnlineLyricsBadges';
import { SettingsPopup } from '@/features/settings/components/SettingsControls';
import { rankOnlineLyrics } from '@/features/library/dialogs/song-edit/rankOnlineLyrics';
import { useOnlineLyricsSettingsStore } from '@/features/settings/useOnlineLyricsSettingsStore';

interface Props {
    title: string;
    artist: string;
    album: string;
    durationMs: number;
    onClose: () => void;
    onDismiss: () => void;
    onApply: (content: string) => void;
}
export default function OnlineLyricsSearch({ title, artist, album, durationMs, onClose, onDismiss, onApply }: Props) {
    const originalQuery = [title, artist, album].map(value => value.trim()).filter(Boolean).join(' ');
    const reducedMotion = useReducedMotion();
    const [query, setQuery] = useState(originalQuery);
    const [provider, setProvider] = useState('all');
    const [results, setResults] = useState<OnlineLyricsCandidate[]>([]);
    const [selected, setSelected] = useState<OnlineLyricsCandidate | null>(null);
    const [preview, setPreview] = useState<OnlineLyricsDetails | null>(null);
    const { details, load } = useOnlineLyricsDetails();
    const [busy, setBusy] = useState(false);
    const [searching, setSearching] = useState(false);
    const [searchQuery, setSearchQuery] = useState(originalQuery);
    const [searchMessage, setSearchMessage] = useState('正在搜索…');
    const [message, setMessage] = useState('');
    const revision = useRef(0);
    const searchRevision = useRef(0);
    const resultList = useRef<HTMLDivElement | null>(null);
    const resultScrollTop = useRef(0);
    const attachResultList = useCallback((element: HTMLDivElement | null) => {
        resultList.current = element;
        if (element) element.scrollTop = resultScrollTop.current;
    }, []);
    const cancelRequests = useCallback(() => { searchRevision.current++; revision.current++; }, []);
    const providerOrder = useOnlineLyricsSettingsStore(state => state.providerOrder);
    const sourceOptions = [{ value: 'all', label: '全部来源' }, ...orderedLyricsProviders(providerOrder).map(([value, label]) => ({ value, label }))];
    const visibleResults = useMemo(() => rankOnlineLyrics(results, { title, artist, album, durationMs }, searchQuery, originalQuery, providerOrder)
        .filter(item => provider === 'all' || item.provider === provider), [results, title, artist, album, durationMs, searchQuery, originalQuery, providerOrder, provider]);
    const search = useCallback(async (keyword: string, source: string) => {
        keyword = keyword.trim();
        if (!keyword) { setSearchMessage('请输入搜索关键词'); return; }
        const id = ++searchRevision.current;
        resultScrollTop.current = 0;
        if (resultList.current) resultList.current.scrollTop = 0;
        revision.current++;
        setSelected(null); setPreview(null); setBusy(false); setSearching(true); setResults([]); setSearchQuery(keyword);
        const sources = orderedLyricsProviders(providerOrder).filter(([key]) => source === 'all' || source === key);
        const found = new Map<string, OnlineLyricsCandidate[]>();
        const statuses = new Map<string, string>(sources.map(([key]) => [key, '搜索中…']));
        const publish = () => {
            if (searchRevision.current !== id) return;
            setResults([...found.values()].flat());
            setSearchMessage(sources.map(([key, label]) => `${label}：${statuses.get(key)}`).join(' · '));
        };
        publish();
        // Request sources independently so a slow API never delays usable results.
        await Promise.all(sources.map(async ([key]) => {
            try {
                const automatic = keyword === originalQuery;
                // AMLL's index matches title/artist, not album; avoid a guaranteed empty first query.
                const sourceQuery = automatic && key === 'amll' ? [title, artist].filter(Boolean).join(' ') : keyword;
                let result = await onlineLyricsService.search(sourceQuery, key);
                if (searchRevision.current !== id) return;
                if (automatic && !result.candidates.length && title.trim() && title.trim() !== sourceQuery.trim()) {
                    statuses.set(key, '正在按歌名补搜…');
                    publish();
                    result = await onlineLyricsService.search(title.trim(), key);
                    if (searchRevision.current !== id) return;
                }
                found.set(key, result.candidates);
                statuses.set(key, result.errors.length ? `请求失败（${result.errors.join('；')}）` : `${result.candidates.length} 条`);
            } catch (error) {
                statuses.set(key, `请求失败（${String(error)}）`);
            }
            publish();
        }));
        if (searchRevision.current === id) setSearching(false);
    }, [title, artist, originalQuery, providerOrder]);
    useEffect(() => {
        let active = true;
        // Defer one microtask so StrictMode's setup/cleanup probe does not send duplicate requests.
        void Promise.resolve().then(() => { if (active) void search(originalQuery, 'all'); });
        return () => { active = false; cancelRequests(); };
    }, [search, originalQuery, cancelRequests]);
    const select = async (candidate: OnlineLyricsCandidate) => {
        resultScrollTop.current = resultList.current?.scrollTop ?? resultScrollTop.current;
        const id = ++revision.current;
        setSelected(candidate); setPreview(null); setBusy(true); setMessage('正在获取歌词…');
        try {
            const detail = await load(candidate, true);
            if (revision.current !== id) return;
            setPreview(detail); setMessage('');
        } catch (error) { if (revision.current === id) setMessage(String(error)); }
        finally { if (revision.current === id) setBusy(false); }
    };
    const back = () => { revision.current++; setSelected(null); setPreview(null); setBusy(false); setMessage(''); };
    const direction = selected ? 1 : -1;
    const pageVariants = {
        enter: (direction: number) => ({ opacity: 0, x: reducedMotion ? 0 : direction * 16 }),
        center: { opacity: 1, x: 0 },
        exit: (direction: number) => ({ opacity: 0, x: reducedMotion ? 0 : direction * -16 }),
    };
    const button = 'rounded-lg border border-neutral-200 px-4 py-2 text-sm dark:border-white/15 disabled:opacity-40';
    return <div className="flex h-full min-h-0 flex-col bg-surface p-6 text-neutral-900 dark:text-white" role="region" aria-label="选择在线歌词">
        <div className="mb-4 flex items-center gap-3"><button type="button" aria-label="返回" onClick={selected ? back : onClose} className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-primary/10"><MdArrowBack className="h-5 w-5" /></button><h3 className="flex-1 font-semibold">选择在线歌词</h3><button type="button" aria-label="关闭歌曲编辑" onClick={onDismiss} className="grid h-8 w-8 place-items-center transition-colors hover:text-primary"><MdClose className="h-6 w-6" /></button></div>
        <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div key={selected ? 'preview' : 'results'} custom={direction} variants={pageVariants} initial="enter" animate="center" exit="exit" transition={{ duration: reducedMotion ? 0 : 0.16 }} className="flex min-h-0 flex-1 flex-col">
        {!selected ? <>
            <div className="flex gap-2">
                <input aria-label="歌词搜索关键词" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!searching && query.trim()) void search(query, provider); } }} className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-transparent px-3 py-2 text-sm dark:border-white/15" />
                <button type="button" onClick={() => void search(query, provider)} disabled={searching || !query.trim()} aria-busy={searching} className={`${button} inline-flex items-center gap-1.5 bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container text-on-primary transition-[background-color,box-shadow,transform] duration-150 enabled:hover:bg-primary/85 base-theme:dark:enabled:hover:bg-on-primary enabled:hover:shadow-md enabled:active:scale-[0.97] enabled:active:bg-primary/75 base-theme:dark:enabled:active:bg-primary-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transform-none`}><MdSearch className={searching ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />{searching ? '搜索中…' : '搜索'}</button>
            </div>
            <div className="my-2 flex items-center justify-between text-xs text-neutral-500"><span>可输入歌名、艺人或专辑</span><button type="button" onClick={() => setQuery(originalQuery)} className="rounded-md px-2 py-1 text-primary transition-[background-color,transform] duration-150 hover:bg-primary/10 active:scale-[0.97] active:bg-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transform-none">恢复原始信息</button></div>
            <div className="my-3 flex items-center justify-between"><span className="text-sm font-medium">搜索结果（{visibleResults.length}）</span><SettingsPopup label="歌词来源" value={provider} onChange={setProvider} options={sourceOptions} menuClassName="z-[10000]" /></div>
            {searchMessage && <p role="status" className="lyrics-editor-scrollbar mb-2 max-h-20 overflow-auto text-xs text-neutral-500">{searchMessage}</p>}
            <div ref={attachResultList} className="lyrics-editor-scrollbar min-h-0 flex-1 overflow-y-auto">{visibleResults.map(item => <button key={`${item.provider}:${item.id}`} type="button" onClick={() => void select(item)} className="mb-2 flex w-full items-center gap-3 rounded-lg border border-neutral-200 p-3 text-left hover:border-primary hover:bg-primary/5 dark:border-white/10">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="block truncate text-xs text-neutral-500">{item.artist}</span><span className="block truncate text-xs text-neutral-500">{item.album}</span><span className="mt-1 block truncate text-xs text-primary">{lyricsProviders.find(([id]) => id === item.provider)?.[1]} · {item.duration_ms ? `${Math.floor(item.duration_ms / 60000)}:${Math.floor(item.duration_ms / 1000 % 60).toString().padStart(2, '0')}` : '时长未知'} · ID: {item.id}</span><OnlineLyricsResultBadges candidate={item} details={details.get(lyricsCandidateKey(item))} load={load} /></span><MdChevronRight />
            </button>)}</div>
        </> : <>
            <div className="mb-4 border-b border-neutral-200 pb-4 dark:border-white/10"><div className="font-semibold">{selected.title}</div><div className="text-sm text-neutral-500">{selected.artist}</div><div className="text-xs text-neutral-500">{selected.album}</div><div className="mt-2 text-xs text-primary">{lyricsProviders.find(([id]) => id === selected.provider)?.[1]} · ID: {selected.id}</div></div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">歌词预览 {preview && <OnlineLyricsBadges details={preview} />}</div>
            <div className="lyrics-editor-scrollbar min-h-0 flex-1 overflow-y-auto">{message && <p role="status" className="text-sm text-neutral-500">{message}</p>}{preview?.document.lines.filter(line => line.text).map(line => <div key={line.id} className="mb-3 flex gap-4 text-sm"><span className="w-14 shrink-0 text-xs text-neutral-400">{line.start_time_ms === null ? '—' : `${Math.floor(line.start_time_ms / 60000).toString().padStart(2, '0')}:${(line.start_time_ms / 1000 % 60).toFixed(3).padStart(6, '0')}`}</span><span>{line.text}{line.translation && <span className="block text-neutral-500">{line.translation}</span>}</span></div>)}</div>
        </>}
        </motion.div>
        </AnimatePresence>
        <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={onClose} className={button}>取消</button>{selected && <button type="button" disabled={busy || !preview} onClick={() => { if (preview) onApply(preview.text); }} className={`${button} bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container text-on-primary`}>使用此歌词</button>}</div>
    </div>;
}
