import { useEffect, useMemo, useState } from 'react';
import { MdAttachFile, MdCheck, MdSearch } from 'react-icons/md';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { audioService } from '@/services/audioService';
import type { SongEditFormValues } from '@/features/library/dialogs/song-edit/songEditForm';
import { getSelectedPath } from '@/utils/dialogSelection';
import { usePlayerStore } from '@/store/usePlayerStore';
import '@/features/library/dialogs/song-edit/SongLyricsFields.css';

// M3 wavy circular tokens: 48px size, 4px stroke, 1.6px inward amplitude,
// approximately 15px wavelength (nine complete waves around the circle).
const progressWave = Array.from({ length: 289 }, (_, index) => {
    const angle = index / 288 * Math.PI * 2;
    const radius = 22 - 1.6 + Math.cos(angle * 9) * 1.6;
    return `${index === 0 ? 'M' : 'L'}${24 + Math.cos(angle) * radius},${24 + Math.sin(angle) * radius}`;
}).join(' ') + 'Z';

interface SongLyricsFieldsProps {
    songPath?: string;
    values: SongEditFormValues;
    onChange: (patch: Partial<SongEditFormValues>) => void;
    onError: (message: string) => void;
    onSearchOnline: () => void;
}

export default function SongLyricsFields({ songPath, values, onChange, onError, onSearchOnline }: SongLyricsFieldsProps) {
    const [embeddedLyrics, setEmbeddedLyrics] = useState('');
    const searchPath = usePlayerStore(state => state.autoLyricsSearchPath);
    const acquiredLyrics = usePlayerStore(state => state.metadata && state.metadata.path === songPath ? state.metadata.lyrics_text : null);

    const customEnabled = values.customLyricsEnabled;

    useEffect(() => {
        // An automatic acquisition may finish while this form is already open.
        // Fill only an untouched empty field, never replace the user's draft.
        if (!customEnabled && !values.lyricsText.trim() && acquiredLyrics?.trim()) {
            onChange({ lyricsText: acquiredLyrics, lyricsSourcePath: '', customLyricsEnabled: true });
        }
    }, [acquiredLyrics, customEnabled, values.lyricsText, onChange]);

    useEffect(() => {
        if (!songPath || customEnabled) {
            const frame = requestAnimationFrame(() => setEmbeddedLyrics(''));
            return () => cancelAnimationFrame(frame);
        }

        let cancelled = false;
        audioService.getRawLyrics(songPath)
            .then((text) => {
                if (cancelled) return;
                setEmbeddedLyrics(text?.trim() || '');
            })
            .catch((error) => {
                if (cancelled) return;
                console.warn('Failed to load embedded lyrics for edit dialog', error);
                setEmbeddedLyrics('');
            });

        return () => {
            cancelled = true;
        };
    }, [customEnabled, songPath]);

    const displayText = customEnabled ? values.lyricsText : embeddedLyrics;
    const searching = Boolean(songPath && searchPath === songPath && !displayText.trim());
    const showEmptyState = (!customEnabled || searching) && displayText.trim().length === 0;
    const customCheckboxLabel = useMemo(() => customEnabled ? '关闭自定义歌词' : '开启自定义歌词', [customEnabled]);
    const handleToggleCustom = () => {
        if (customEnabled) {
            onChange({ customLyricsEnabled: false });
            return;
        }

        onChange({
            customLyricsEnabled: true,
            lyricsText: values.lyricsText.trim().length > 0 ? values.lyricsText : embeddedLyrics,
        });
    };

    const handleSelectLyrics = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: '歌词文件', extensions: ['lrc', 'ttml', 'txt'] }],
            });
            const lyricsPath = getSelectedPath(selected);
            if (!lyricsPath) return;

            const content = await readTextFile(lyricsPath);
            onChange({
                lyricsText: content,
                lyricsSourcePath: lyricsPath,
                customLyricsEnabled: true,
            });
        } catch (error) {
            console.error('Failed to read lyrics file', error);
            onError('读取歌词文件失败');
        }
    };

    return (
        <div className="relative flex h-full min-h-0 flex-col">
            <div className="relative min-h-0 flex-1 border border-neutral-200 bg-white/40 dark:border-white/10 dark:bg-white/3 base-theme:bg-surface">
                <textarea
                    aria-label="歌词内容"
                    aria-busy={searching}
                    value={displayText}
                    readOnly={!customEnabled}
                    onChange={(event) => onChange({ lyricsText: event.target.value, lyricsSourcePath: values.lyricsSourcePath })}
                    className={`lyrics-editor-scrollbar h-full min-h-0 w-full resize-none bg-transparent px-4 py-4 font-mono text-sm leading-6 text-neutral-900 outline-none dark:text-white ${showEmptyState ? 'text-transparent caret-transparent' : ''}`}
                />
                {showEmptyState && (
                    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center text-neutral-900 dark:text-neutral-100">
                        {searching ? <>
                            <svg role="progressbar" aria-label="正在搜索歌词" viewBox="0 0 48 48" className="lyrics-search-ring mb-4 h-12 w-12 text-primary" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
                                <g className="lyrics-search-ring-spin">
                                    <circle cx="24" cy="24" r="22" pathLength="100" className="lyrics-search-ring-track" />
                                    <path d={progressWave} pathLength="100" className="lyrics-search-ring-arc" />
                                </g>
                            </svg>
                            <div className="text-[18px]">正在搜索歌词...</div>
                        </> : <>
                            <div className="text-[18px]">无可用歌词</div>
                            <div className="mt-1 text-[16px] text-neutral-600 dark:text-neutral-400">此歌曲没有任何可用的歌词。</div>
                        </>}
                    </div>
                )}
            </div>

            <div className="mt-2 flex h-10 shrink-0 items-center justify-between gap-3">
                <button
                    type="button"
                    aria-label={customCheckboxLabel}
                    onClick={handleToggleCustom}
                    className="flex items-center gap-3"
                >
                    <span className={`grid h-5 w-5 place-items-center rounded-[5px] border-2 transition-colors ${customEnabled ? 'border-primary bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container text-on-primary' : 'border-neutral-400 text-transparent dark:border-neutral-500'}`}>
                        <MdCheck className="text-base" />
                    </span>
                    <span className="text-[15px] text-neutral-900 dark:text-neutral-100">自定义歌词</span>
                </button>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleSelectLyrics}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-transparent px-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                    >
                        <MdAttachFile className="h-5 w-5 shrink-0" />
                        选择本地歌词
                    </button>
                    <button type="button" onClick={onSearchOnline} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-primary px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"><MdSearch className="h-5 w-5 shrink-0" />在线搜索歌词</button>
                </div>
            </div>
        </div>
    );
}
