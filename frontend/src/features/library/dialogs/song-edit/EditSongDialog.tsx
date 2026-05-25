import { Fragment, useEffect, useState } from 'react';
import type React from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { motion } from 'framer-motion';
import { MdClose } from 'react-icons/md';
import type { SongMetadata } from '@/types';
import CoverImage from '@/components/common/CoverImage';
import { libraryService } from '@/services/libraryService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import SongInfoFields from '@/features/library/dialogs/song-edit/SongInfoFields';
import SongLyricsFields from '@/features/library/dialogs/song-edit/SongLyricsFields';
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
    { id: 'artwork', label: '插图' },
    { id: 'lyrics', label: '歌词' },
];

function isSameSong(a: SongMetadata | null, b: SongMetadata) {
    if (!a) return false;
    return (typeof a.id === 'number' && a.id === b.id) || (!!a.path && a.path === b.path);
}

export default function EditSongDialog({ isOpen, song, onClose }: EditSongDialogProps) {
    const [activeTab, setActiveTab] = useState<Tab>('details');
    const [values, setValues] = useState<SongEditFormValues | null>(null);
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
        setErrors({});
        setMessage('');
        setActiveTab('details');
    }, [isOpen, song]);

    const handleChange = (patch: Partial<SongEditFormValues>) => {
        setValues(current => current ? { ...current, ...patch } : current);
        setErrors({});
        setMessage('');
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!song || !values) return;

        const { request, errors: nextErrors } = buildUpdateSongDetailsRequest(song, values);
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
                if (updated.path && request.lyrics_text !== song.lyrics_text) {
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
            return <SongInfoFields values={resolvedValues} errors={errors} onChange={handleChange} />;
        }
        if (activeTab === 'lyrics') {
            return <SongLyricsFields songPath={song.path} values={resolvedValues} onChange={handleChange} onError={setMessage} />;
        }
        if (activeTab === 'artwork') {
            return (
                <div className="flex h-full min-h-0 items-center justify-center">
                    <div className="aspect-square w-[min(430px,100%)] overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 shadow-sm dark:border-white/10 dark:bg-neutral-800">
                        <CoverImage song={song} className="h-full w-full" iconClassName="text-6xl" />
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-[9999]" onClose={saving ? () => undefined : onClose}>
                <DialogBackdrop
                    transition
                    className="fixed inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
                />

                <div className="fixed inset-0 overflow-y-auto p-0 sm:p-4">
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
                            <DialogPanel className="h-screen w-full transform overflow-hidden bg-[#fbfbfb] text-left align-middle shadow-2xl transition-all dark:bg-[#202020] sm:h-[min(820px,calc(100vh-2rem))] sm:max-w-[640px] sm:rounded-[6px]">
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
                                            <div className="h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[5px] bg-neutral-100 shadow-sm ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
                                                <CoverImage song={song} className="h-full w-full" iconClassName="text-5xl" />
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

                                    <div className="flex shrink-0 items-center justify-between px-6 pb-4 pt-3">
                                        <div />
                                        <div className="flex gap-2">
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="h-10 min-w-[120px] rounded-[7px] bg-primary px-7 text-[15px] font-medium text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                                            >
                                                {saving ? '保存中...' : '确定'}
                                            </button>
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            disabled={saving}
                                                className="h-10 min-w-[120px] rounded-[7px] border border-neutral-300 bg-white px-7 text-[15px] font-medium text-neutral-800 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
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
