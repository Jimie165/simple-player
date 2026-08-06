import { useEffect, useMemo, useState } from 'react';
import { MdAttachFile, MdCheck } from 'react-icons/md';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { audioService } from '@/services/audioService';
import type { SongEditFormValues } from '@/features/library/dialogs/song-edit/songEditForm';
import { getSelectedPath } from '@/utils/dialogSelection';

interface SongLyricsFieldsProps {
    songPath?: string;
    values: SongEditFormValues;
    onChange: (patch: Partial<SongEditFormValues>) => void;
    onError: (message: string) => void;
}

export default function SongLyricsFields({ songPath, values, onChange, onError }: SongLyricsFieldsProps) {
    const [embeddedLyrics, setEmbeddedLyrics] = useState('');

    const customEnabled = values.customLyricsEnabled;

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
    const showEmptyState = !customEnabled && displayText.trim().length === 0;
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
        <div className="flex h-full min-h-0 flex-col">
            <div className="relative min-h-0 flex-1 border border-neutral-200 bg-white/40 dark:border-white/10 dark:bg-white/3">
                <textarea
                    value={displayText}
                    readOnly={!customEnabled}
                    onChange={(event) => onChange({ lyricsText: event.target.value, lyricsSourcePath: values.lyricsSourcePath })}
                    className={`lyrics-editor-scrollbar h-full min-h-0 w-full resize-none bg-transparent px-4 py-4 font-mono text-sm leading-6 text-neutral-900 outline-none dark:text-white ${showEmptyState ? 'text-transparent caret-transparent' : ''}`}
                />
                {showEmptyState && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center text-neutral-900 dark:text-neutral-100">
                        <div className="text-[18px]">无可用歌词</div>
                        <div className="mt-1 text-[16px] text-neutral-600 dark:text-neutral-400">此歌曲没有任何可用的歌词。</div>
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
                    <span className={`grid h-5 w-5 place-items-center rounded-[5px] border-2 transition-colors ${customEnabled ? 'border-primary bg-primary text-on-primary' : 'border-neutral-400 text-transparent dark:border-neutral-500'}`}>
                        <MdCheck className="text-base" />
                    </span>
                    <span className="text-[15px] text-neutral-900 dark:text-neutral-100">自定义歌词</span>
                </button>

                <div>
                    <button
                        type="button"
                        onClick={handleSelectLyrics}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                    >
                        <MdAttachFile className="text-lg" />
                        选择歌词
                    </button>
                </div>
            </div>
        </div>
    );
}
