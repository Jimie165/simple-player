import { useEffect, useState } from 'react';
import type React from 'react';
import CoverImage from '@/components/common/CoverImage';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import AlbumArtworkFields from '@/features/library/dialogs/album-edit/AlbumArtworkFields';
import AlbumInfoFields from '@/features/library/dialogs/album-edit/AlbumInfoFields';
import {
    buildUpdateAlbumDetailsRequest,
    getAlbumEditCoverPath,
    makeInitialAlbumEditForm,
    makeOriginalAlbumField,
    type AlbumEditFieldKey,
    type AlbumEditFormErrors,
    type AlbumEditFormValues,
    type AlbumOriginalMetadata,
} from '@/features/library/dialogs/album-edit/albumEditForm';
import MetadataEditDialogShell from '@/features/library/dialogs/metadata-edit/MetadataEditDialogShell';
import { fileService } from '@/services/fileService';
import { libraryService } from '@/services/libraryService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';

interface EditAlbumDialogProps {
    isOpen: boolean;
    album: AlbumData | null;
    onClose: () => void;
}

type Tab = 'details' | 'artwork';

const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'details', label: '详细信息' },
    { id: 'artwork', label: '封面' },
];

export default function EditAlbumDialog({ isOpen, album, onClose }: EditAlbumDialogProps) {
    const [activeTab, setActiveTab] = useState<Tab>('details');
    const [values, setValues] = useState<AlbumEditFormValues | null>(null);
    const [originals, setOriginals] = useState<AlbumOriginalMetadata | null>(null);
    const [errors, setErrors] = useState<AlbumEditFormErrors>({});
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    const triggerLibraryUpdate = useLibraryStore(state => state.triggerLibraryUpdate);
    const triggerPlaylistUpdate = useLibraryStore(state => state.triggerPlaylistUpdate);
    const refreshRecentHistory = useLibraryStore(state => state.refreshRecentHistory);
    const updateSongInQueues = useLibraryStore(state => state.updateSongInQueues);
    const playerMetadata = usePlayerStore(state => state.metadata);
    const setPlayerMetadata = usePlayerStore(state => state.setMetadata);

    useEffect(() => {
        if (!isOpen || !album) return;
        setValues(makeInitialAlbumEditForm(album));
        setOriginals(null);
        setErrors({});
        setMessage('');
        setActiveTab('details');
    }, [album, isOpen]);

    useEffect(() => {
        if (!isOpen || !album) return;
        const editableSongs = album.songs.filter(
            (song): song is typeof song & { id: number; path: string } => (
                typeof song.id === 'number'
                && typeof song.path === 'string'
                && song.path.length > 0
            )
        );
        if (editableSongs.length !== album.songs.filter(song => typeof song.id === 'number').length) return;

        let cancelled = false;
        Promise.all(editableSongs.map(async song => {
            const original = await fileService.getOriginalMetadata(song.path);
            return [song.id, { ...song, ...original, id: song.id, path: song.path }] as const;
        }))
            .then(entries => {
                if (!cancelled) setOriginals(Object.fromEntries(entries));
            })
            .catch(error => {
                if (!cancelled) {
                    console.warn('Failed to load original album metadata', error);
                    setOriginals(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [album, isOpen]);

    const resolvedValues = values ?? (album ? makeInitialAlbumEditForm(album) : null);
    if (!album || !resolvedValues) return null;

    const handleFieldChange = (field: AlbumEditFieldKey, value: string) => {
        setValues(current => {
            const base = current ?? makeInitialAlbumEditForm(album);
            return {
                ...base,
                fields: {
                    ...base.fields,
                    [field]: { value, mixed: false, dirty: true, restoreOriginal: false },
                },
            };
        });
        setErrors(current => ({ ...current, [field]: undefined }));
        setMessage('');
    };

    const handleRestoreField = (field: AlbumEditFieldKey) => {
        if (!originals) return;
        setValues(current => {
            const base = current ?? makeInitialAlbumEditForm(album);
            return {
                ...base,
                fields: {
                    ...base.fields,
                    [field]: makeOriginalAlbumField(album, originals, field),
                },
            };
        });
        setErrors(current => ({ ...current, [field]: undefined }));
        setMessage('');
    };

    const handleArtworkChange = (patch: { artworkSourcePath: string | null; removeArtwork: boolean }) => {
        setValues(current => ({
            ...(current ?? makeInitialAlbumEditForm(album)),
            ...patch,
        }));
        setMessage('');
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const { request, errors: nextErrors } = buildUpdateAlbumDetailsRequest(album, resolvedValues, originals);
        setErrors(nextErrors);
        if (!request) {
            setActiveTab('details');
            return;
        }

        setSaving(true);
        setMessage('');
        try {
            const updatedSongs = await libraryService.updateAlbumDetails(request);
            updatedSongs.forEach(updateSongInQueues);
            triggerLibraryUpdate();
            triggerPlaylistUpdate();
            await refreshRecentHistory();

            const updatedCurrent = updatedSongs.find(song => (
                (playerMetadata?.id !== undefined && song.id === playerMetadata.id)
                || (!!playerMetadata?.path && song.path === playerMetadata.path)
            ));
            if (playerMetadata && updatedCurrent) {
                setPlayerMetadata({ ...playerMetadata, ...updatedCurrent });
            }
            onClose();
        } catch (error) {
            console.error('Failed to update album details', error);
            setMessage(error instanceof Error ? error.message : String(error || '保存失败'));
        } finally {
            setSaving(false);
        }
    };

    const displayedCoverPath = getAlbumEditCoverPath(
        album,
        resolvedValues.artworkSourcePath,
        resolvedValues.removeArtwork
    );
    const displayedAlbumName = resolvedValues.fields.album.dirty
        ? resolvedValues.fields.album.mixed ? '混合' : resolvedValues.fields.album.value || '未知专辑'
        : album.name;
    const displayedAlbumArtist = resolvedValues.fields.albumArtist.mixed
        ? '混合'
        : resolvedValues.fields.albumArtist.value || '未知专辑艺人';

    return (
        <MetadataEditDialogShell
            isOpen={isOpen}
            saving={saving}
            onClose={onClose}
            onSubmit={handleSubmit}
            title="编辑专辑信息"
            cover={(
                <CoverImage
                    song={album.songs[0]}
                    src={displayedCoverPath}
                    className="h-full w-full"
                    iconClassName="text-5xl"
                    fallbackToSongCover={false}
                />
            )}
            header={(
                <>
                    <div className="truncate text-[18px] leading-6 text-neutral-950 dark:text-neutral-50">{displayedAlbumName}</div>
                    <div className="truncate text-[15px] leading-6 text-neutral-500 dark:text-neutral-400">{displayedAlbumArtist}</div>
                    <div className="truncate text-[15px] leading-6 text-neutral-500 dark:text-neutral-400">{album.songs.length} 首歌曲</div>
                </>
            )}
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabLayoutId="edit-album-tab-underline"
            scrollContent={activeTab === 'details'}
            message={message}
        >
            {activeTab === 'details' ? (
                <AlbumInfoFields
                    album={album}
                    fields={resolvedValues.fields}
                    originals={originals}
                    errors={errors}
                    onChange={handleFieldChange}
                    onRestore={handleRestoreField}
                />
            ) : (
                <AlbumArtworkFields
                    album={album}
                    artworkSourcePath={resolvedValues.artworkSourcePath}
                    removeArtwork={resolvedValues.removeArtwork}
                    onChange={handleArtworkChange}
                    onError={setMessage}
                />
            )}
        </MetadataEditDialogShell>
    );
}
