import { useEffect, useState } from 'react';
import type React from 'react';
import { MdChevronLeft, MdChevronRight } from 'react-icons/md';
import type { SongMetadata } from '@/types';
import CoverImage from '@/components/common/CoverImage';
import CustomTooltip from '@/components/common/CustomTooltip';
import MetadataEditDialogShell from '@/features/library/dialogs/metadata-edit/MetadataEditDialogShell';
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
    return offsetMs > 0 ? `延后 ${secondsStr} 秒` : `提前 ${secondsStr} 秒`;
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
                    updated.path
                    && (
                        request.lyrics_text !== song.lyrics_text
                        || request.lyrics_offset_ms !== (song.lyrics_offset_ms ?? 0)
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

    const displayedCoverPath = resolvedValues.artworkSourcePath
        ?? (resolvedValues.removeArtwork ? song.embedded_cover_path : song.cover_path)
        ?? null;

    const lyricsFooter = activeTab === 'lyrics' ? (
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
    ) : undefined;

    return (
        <MetadataEditDialogShell
            isOpen={isOpen}
            saving={saving}
            onClose={onClose}
            onSubmit={handleSubmit}
            title="编辑歌曲信息"
            cover={(
                <CoverImage
                    song={song}
                    src={displayedCoverPath}
                    className="h-full w-full"
                    iconClassName="text-5xl"
                    fallbackToSongCover={false}
                />
            )}
            header={(
                <>
                    <div className="truncate text-[18px] leading-6 text-neutral-950 dark:text-neutral-50">{resolvedValues.title || song.title}</div>
                    <div className="truncate text-[15px] leading-6 text-neutral-500 dark:text-neutral-400">{resolvedValues.artist || '未知艺人'}</div>
                    <div className="truncate text-[15px] leading-6 text-neutral-500 dark:text-neutral-400">{resolvedValues.album || '未知专辑'}</div>
                </>
            )}
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabLayoutId="edit-song-tab-underline"
            scrollContent={activeTab === 'details'}
            message={message}
            footerStart={lyricsFooter}
        >
            {activeTab === 'details' && (
                <SongInfoFields
                    values={resolvedValues}
                    originalValues={originalValues}
                    errors={errors}
                    onChange={handleChange}
                />
            )}
            {activeTab === 'lyrics' && (
                <SongLyricsFields
                    songPath={song.path}
                    values={resolvedValues}
                    onChange={handleChange}
                    onError={setMessage}
                />
            )}
            {activeTab === 'artwork' && (
                <SongArtworkFields
                    song={song}
                    artworkSourcePath={resolvedValues.artworkSourcePath}
                    removeArtwork={resolvedValues.removeArtwork}
                    onChange={handleChange}
                    onError={setMessage}
                />
            )}
        </MetadataEditDialogShell>
    );
}
