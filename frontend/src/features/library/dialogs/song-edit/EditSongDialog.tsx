import { Fragment, useEffect, useState } from 'react';
import type React from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { motion } from 'framer-motion';
import { MdChevronLeft, MdChevronRight, MdClose } from 'react-icons/md';
import type { SongMetadata } from '@/types';
import CoverImage from '@/components/common/CoverImage';
import CustomTooltip from '@/components/common/CustomTooltip';
import { libraryService } from '@/services/libraryService';
import { fileService } from '@/services/fileService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import SongInfoFields from '@/features/library/dialogs/song-edit/SongInfoFields';
import SongLyricsFields from '@/features/library/dialogs/song-edit/SongLyricsFields';
import SongArtworkFields from '@/features/library/dialogs/song-edit/SongArtworkFields';
import {
    buildUpdateSongDetailsRequest,
    makeInitialSongEditForm,
    type SongEditFormErrors,
    type SongEditFormValues,
} from '@/features/library/dialogs/song-edit/songEditForm';

interface EditSongDialogProps {
    isOpen: boolean;
    song: SongMetadata | null;
    onClose: () => void;
}

type Tab = 'details' | 'artwork' | 'lyrics';

const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'details', label: '详细信息' },
    { id: 'artwork', label: '封面' },
    { id: 'lyrics', label: '歌词' },
];

const LYRICS_OFFSET_STEP_MS = 100;
const LYRICS_OFFSET_LIMIT_MS = 5000;

function formatSeconds(seconds: number) {
    return Number.isInteger(seconds)
        ? String(seconds)
        : seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

const LYRICS_OFFSET_STEP_LABEL = `${formatSeconds(LYRICS_OFFSET_STEP_MS / 1000)} 秒`;

function formatLyricsOffset(offsetMs: number) {
    if (offsetMs === 0) return '歌词偏移：0 秒';
    const seconds = Math.abs(offsetMs) / 1000;
    const secondsStr = formatSeconds(seconds);
    return offsetMs > 0 ? '延后 ' + secondsStr + ' 秒' : '提前 ' + secondsStr + ' 秒';
}

function isSameSong(a: SongMetadata | null, b: SongMetadata) {
    if (!a) return false;
    return (typeof a.id === 'number' && a.id === b.id) || (!!a.path && a.path === b.path);
}

export default function EditSongDialog({ isOpen, song, onClose }: EditSongDialogProps) {
    const [activeTab, setActiveTab] = useState<Tab>('details');
    const [values, setValues] = useState<SongEditFormValues | null>(null);
    const [originalValues, setOriginalValues] = useState<SongEditFormValues | null>(null);
    const [errors, setErrors] = useState<SongEditFormErrors>({});
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    const triggerLibraryUpdate = useLibraryStore(state => state.triggerLibraryUpdate);
    const triggerPlaylistUpdate = useLibraryStore(state => state.triggerPlaylistUpdate);
    const refreshRecentHistory = useLibraryStore(state => state.refreshRecentHistory);
    const updateSongInQueues = useLibraryStore(state => state.updateSongInQueues);
    const playerMetadata = usePlayerStore(state => state.metadata);
    const setPlayerMetadata = usePlayerStore(state => state.setMetadata);
    const reloadLyricsForPath = usePlayerStore(state => state.reloadLyricsForPath);

    useEffect(() => {
        if (!isOpen || !song) return;
        setValues(makeInitialSongEditForm(song));
        setOriginalValues(null);
        setErrors({});
        setMessage('');
        setActiveTab('details');
    }, [isOpen, song]);

    useEffect(() => {
        if (!isOpen || !song?.path) return;

        let cancelled = false;
        fileService.getOriginalMetadata(song.path)
            .then((original) => {
                if (cancelled) return;
                setOriginalValues(makeInitialSongEditForm({
                    ...song,
                    ...original,
                    id: song.id,
                    path: song.path,
                    lyrics_text: song.lyrics_text,
                    lyrics_source_path: song.lyrics_source_path,
                    lyrics_offset_ms: song.lyrics_offset_ms,
                }));
            })
            .catch((error) => {
                if (cancelled) return;
                console.warn('Failed to load original song metadata', error);
                setOriginalValues(null);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, song]);

    const handleChange = (patch: Partial<SongEditFormValues>) => {
        setValues(current => current ? { ...current, ...patch } : current);
        setErrors({});
        setMessage('');
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!song || !values) return;

        const { request, errors: nextErrors } = buildUpdateSongDetailsRequest(song, values, originalValues);
        setErrors(nextErrors);
        if (!request) {
            setActiveTab('details');
            return;
        }

        setSaving(true);
        setMessage('');
        try {
            const updated = await libraryService.updateSongDetails(request);
            updateSongInQueues(updated);
            triggerLibraryUpdate();
            triggerPlaylistUpdate();
            await refreshRecentHistory();

            if (isSameSong(playerMetadata, updated)) {
                setPlayerMetadata({ ...playerMetadata, ...updated });
                if (
                    updated.path &&
                    (
                        request.lyrics_text !== song.lyrics_text ||
                        request.lyrics_offset_ms !== (song.lyrics_offset_ms ?? 0)
                    )
                ) {
                    await reloadLyricsForPath(updated.path);
                }
            }

            onClose();
        } catch (error) {
            console.error('Failed to update song details', error);
            setMessage(error instanceof Error ? error.message : '保存失败');
        } finally {
            setSaving(false);
        }
    };

    const resolvedValues = values ?? (song ? makeInitialSongEditForm(song) : null);

    if (!song || !resolvedValues) return null;

    const renderPanel = () => {
        if (activeTab === 'details') {
            return <SongInfoFields values={resolvedValues} originalValues={originalValues} errors={errors} onChange={handleChange} />;
        }
        if (activeTab === 'lyrics') {
            return <SongLyricsFields songPath={song.path} values={resolvedValues} onChange={handleChange} onError={setMessage} />;
        }
        if (activeTab === 'artwork') {
            return (
                <SongArtworkFields
                    song={song}
                    artworkSourcePath={resolvedValues.artworkSourcePath}
                    removeArtwork={resolvedValues.removeArtwork}
                    onChange={handleChange}
                    onError={setMessage}
                />
            );
        }
        return null;
    };

    const displayedCoverPath = resolvedValues.artworkSourcePath
        ?? (resolvedValues.removeArtwork ? song.embedded_cover_path : song.cover_path)
        ?? null;

    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-9999" onClose={saving ? () => undefined : onClose}>
                <DialogBackdrop
                    transition
                    className="fixed inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity data-closed:opacity-0 data-enter:duration-300 data-leave:duration-200 data-enter:ease-out data-leave:ease-in"
                />

                <div className="fixed inset-0 overflow-y-auto p-2 sm:p-4">
                    <div className="flex min-h-full items-center justify-center text-center">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="h-[min(820px,calc(100vh-1rem))] w-[min(640px,calc(100vw-1rem))] transform overflow-hidden rounded-xl bg-[#fbfbfb] text-left align-middle shadow-2xl transition-all dark:bg-[#202020] sm:h-[min(820px,calc(100vh-2rem))] sm:w-[min(640px,calc(100vw-2rem))] sm:rounded-md">
                                <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
                                    <DialogTitle className="sr-only">编辑歌曲信息</DialogTitle>
                                    <div className="relative shrink-0 px-6 pt-7">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            disabled={saving}
                                            className="absolute right-6 top-4 grid h-8 w-8 place-items-center text-neutral-900 transition-colors hover:text-[#ff2d46] disabled:opacity-50 dark:text-neutral-100"
                                        >
                                            <MdClose className="text-2xl" />
                                        </button>

                                        <div className="flex items-start gap-3 pr-10">
                                            <div className="h-19 w-19 shrink-0 overflow-hidden rounded-[5px] bg-neutral-100 shadow-sm ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
                                                <CoverImage song={song} src={displayedCoverPath} className="h-full w-full" iconClassName="text-5xl" fallbackToSongCover={false} />
                                            </div>
                                            <div className="min-w-0 pt-1">
                                                <div className="truncate text-[18px] leading-6 text-neutral-950 dark:text-neutral-50">{resolvedValues.title || song.title}</div>
                                                <div className="truncate text-[15px] leading-6 text-neutral-500 dark:text-neutral-400">{resolvedValues.artist || '未知艺人'}</div>
                                                <div className="truncate text-[15px] leading-6 text-neutral-500 dark:text-neutral-400">{resolvedValues.album || '未知专辑'}</div>
                                            </div>
                                        </div>

                                        <div className="mt-8 flex justify-center">
                                            <div className="flex items-center gap-7 overflow-x-auto px-2 text-[16px] font-bold">
                                                {tabs.map(tab => (
                                                    <button
                                                        key={tab.id}
                                                        type="button"
                                                        onClick={() => setActiveTab(tab.id)}
                                                        className={`relative whitespace-nowrap pb-4 transition-colors ${activeTab === tab.id
                                                            ? 'text-neutral-950 dark:text-neutral-50'
                                                            : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                                                            }`}
                                                    >
                                                        {tab.label}
                                                        {activeTab === tab.id && (
                                                            <motion.span
                                                                layoutId="edit-song-tab-underline"
                                                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                                                className="absolute bottom-0 left-0 h-1 w-full rounded-full bg-primary"
                                                            />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`min-h-0 flex-1 px-6 py-4 ${activeTab === 'details' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
                                        {renderPanel()}
                                        {message && <div className="mt-4 text-sm text-red-500">{message}</div>}
                                    </div>

                                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-6 pb-4 pt-3">
                                        {activeTab === 'lyrics' ? (
                                            <div className="flex min-w-0 items-center gap-1">
                                                <CustomTooltip text={`歌词延后 ${LYRICS_OFFSET_STEP_LABEL}`} placement="top">
                                                    <button
                                                        type="button"
                                                        aria-label={`歌词延后 ${LYRICS_OFFSET_STEP_LABEL}`}
                                                        disabled={resolvedValues.lyricsOffsetMs >= LYRICS_OFFSET_LIMIT_MS}
                                                        onClick={() => handleChange({
                                                            lyricsOffsetMs: Math.min(
                                                                LYRICS_OFFSET_LIMIT_MS,
                                                                resolvedValues.lyricsOffsetMs + LYRICS_OFFSET_STEP_MS
                                                            ),
                                                        })}
                                                        className="grid h-9 w-9 place-items-center rounded-full text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
                                                    >
                                                        <MdChevronLeft className="text-[26px]" />
                                                    </button>
                                                </CustomTooltip>

                                                <span
                                                    aria-live="polite"
                                                    className="min-w-23 text-center text-[13px] font-medium tabular-nums text-neutral-600 dark:text-neutral-300"
                                                >
                                                    {formatLyricsOffset(resolvedValues.lyricsOffsetMs)}
                                                </span>

                                                <CustomTooltip text={`歌词提前 ${LYRICS_OFFSET_STEP_LABEL}`} placement="top">
                                                    <button
                                                        type="button"
                                                        aria-label={`歌词提前 ${LYRICS_OFFSET_STEP_LABEL}`}
                                                        disabled={resolvedValues.lyricsOffsetMs <= -LYRICS_OFFSET_LIMIT_MS}
                                                        onClick={() => handleChange({
                                                            lyricsOffsetMs: Math.max(
                                                                -LYRICS_OFFSET_LIMIT_MS,
                                                                resolvedValues.lyricsOffsetMs - LYRICS_OFFSET_STEP_MS
                                                            ),
                                                        })}
                                                        className="grid h-9 w-9 place-items-center rounded-full text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
                                                    >
                                                        <MdChevronRight className="text-[26px]" />
                                                    </button>
                                                </CustomTooltip>
                                            </div>
                                        ) : (
                                            <div />
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="h-10 min-w-30 rounded-[7px] bg-primary px-7 text-[15px] font-medium text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                                            >
                                                {saving ? '保存中...' : '确定'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                disabled={saving}
                                                className="h-10 min-w-30 rounded-[7px] border border-neutral-300 bg-white px-7 text-[15px] font-medium text-neutral-800 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
