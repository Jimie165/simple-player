import { useState, useRef, useEffect, useMemo } from 'react';
import { useSelectionStore } from '../../store/useSelectionStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useNavigationStore } from '../../store/useNavigationStore';
import { audioService } from '../../services/audioService';
import { libraryService } from '../../services/libraryService';
import { useAddToPlaylistStore } from '../../store/useAddToPlaylistStore';
import { MdPlayArrow, MdPlaylistAdd, MdAdd, MdDelete, MdMoreHoriz, MdPlaylistRemove } from 'react-icons/md';
import { IoClose, IoSquareOutline, IoCheckbox, IoHeart, IoHeartOutline } from 'react-icons/io5';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import type { SongMetadata } from '../../types';

interface ActionItem {
    id: string;
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'default';
    hideLabel?: boolean;
}

export default function SelectionActionBar() {
    const { isSelectionMode, selectedIds, selectionType, clearSelection, selectedItemsMap } = useSelectionStore();
    const { setPlaylist, setCurrentSongIndex, addToNext, removeFromRecent, triggerLibraryUpdate } = useLibraryStore();
    const { setIsPlaying, setMetadata, setShuffleState } = usePlayerStore();
    const { activeOverlay } = useNavigationStore();

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [visibleCount, setVisibleCount] = useState(4);
    const containerRef = useRef<HTMLDivElement>(null);
    const actionsRef = useRef<HTMLDivElement>(null);

    // Dynamicly check if "All" is selected. 
    // Since we don't know the exact "total count" here, we'll use a signal or assume 
    // if we just clicked it, it's all selected.
    const [justClickedAll, setJustClickedAll] = useState(false);

    useEffect(() => {
        if (selectedIds.size === 0) setJustClickedAll(false);
    }, [selectedIds.size]);

    const handleToggleAll = () => {
        if (justClickedAll) {
            clearSelection();
            setJustClickedAll(false);
        } else {
            useSelectionStore.getState().setSelectAllRequested(true);
            setJustClickedAll(true);
        }
    };

    useEffect(() => {
        const calculateVisibleCount = () => {
            // Estimate available width based on viewport
            // Max width is 90vw.
            // Left fixed content (Checkbox + Text + Close + Divider + Padding) is approx 200px.
            // Each button is approx 100-110px.

            const maxContainerWidth = Math.min(window.innerWidth * 0.9, 800); // Allow reasonable max width cap
            const leftContentWidth = 200;
            const availableForActions = maxContainerWidth - leftContentWidth;

            // If very small screen, force at least 1 action if possible, else 0
            if (availableForActions < 50) {
                setVisibleCount(0);
                return;
            }

            const buttonAverageWidth = 110;
            let count = Math.floor(availableForActions / buttonAverageWidth);

            // Clamp between 0 and total actions
            count = Math.max(0, Math.min(count, 5));

            setVisibleCount(count);
        };

        calculateVisibleCount();
        window.addEventListener('resize', calculateVisibleCount);
        return () => window.removeEventListener('resize', calculateVisibleCount);
    }, [isSelectionMode]);



    const count = selectedIds.size;

    const selectedItems = useMemo(() => {
        if (!selectedItemsMap) return [];
        return Array.from(selectedIds).map(id => selectedItemsMap.get(id)).filter(Boolean);
    }, [selectedIds, selectedItemsMap]);

    const { syncSongs, hasAsyncItems } = useMemo(() => {
        const songs: SongMetadata[] = [];
        let hasAsync = false;

        if (selectionType === 'song' || selectionType === 'file') {
            songs.push(...selectedItems.filter(i => i.id && typeof i.id === 'number') as SongMetadata[]);
        } else if (selectionType === 'playlist') {
            hasAsync = true;
        } else if (selectionType === 'album' || selectionType === 'artist') {
            selectedItems.forEach(item => {
                if (item.songs && Array.isArray(item.songs)) {
                    songs.push(...item.songs.filter((s: SongMetadata) => typeof s.id === 'number'));
                }
            });
        }
        return { syncSongs: songs, hasAsyncItems: hasAsync };
    }, [selectedItems, selectionType]);

    const isAllFavorited = !hasAsyncItems && syncSongs.length > 0 && syncSongs.every(s => s.is_favorite);

    const getSelectedItems = (): any[] => selectedItems;

    if (!isSelectionMode) return null;

    const handlePlay = async () => {
        const items = getSelectedItems();
        if (items.length === 0) return;

        let songsToPlay: SongMetadata[] = [];

        for (const item of items) {
            if (selectionType === 'song' || selectionType === 'file' || item.type === 'file') {
                if (item.path) {
                    songsToPlay.push(item as SongMetadata);
                }
            } else if (selectionType === 'album' || selectionType === 'artist' || item.type === 'album') {
                if (item.songs && Array.isArray(item.songs)) {
                    songsToPlay.push(...item.songs);
                }
            } else if (selectionType === 'recent') {
                if (item.type === 'file' && item.path) {
                    songsToPlay.push(item as SongMetadata);
                } else if ((item.type === 'album' || item.type === 'folder') && item.songs) {
                    songsToPlay.push(...item.songs);
                }
            }
        }

        if (songsToPlay.length > 0) {
            setPlaylist(songsToPlay);
            setShuffleState(false);
            setCurrentSongIndex(0);
            const first = songsToPlay[0];
            if (first.path) {
                setMetadata(first);
                await audioService.play(first.path, first);
                setIsPlaying(true);
            }
            clearSelection();
        } else if (selectionType === 'playlist') {
            // Special async loading for playlists
            const playlistSongs: SongMetadata[] = [];
            for (const item of items) {
                try {
                    const songs = await libraryService.getPlaylistSongs(item.id);
                    playlistSongs.push(...songs);
                } catch (e) { console.error(e); }
            }
            if (playlistSongs.length > 0) {
                setPlaylist(playlistSongs);
                setShuffleState(false);
                setCurrentSongIndex(0);
                const first = playlistSongs[0];
                if (first.path) {
                    setMetadata(first);
                    await audioService.play(first.path, first);
                    setIsPlaying(true);
                }
                clearSelection();
            }
        }
    };

    const handleAddToQueue = async () => {
        const items = getSelectedItems();
        if (selectionType === 'playlist') {
            for (const item of items) {
                try {
                    const songs = await libraryService.getPlaylistSongs(item.id);
                    [...songs].reverse().forEach((s: SongMetadata) => addToNext(s));
                } catch (e) { console.error(e); }
            }
        } else {
            items.forEach(item => {
                if (item.songs && Array.isArray(item.songs)) {
                    [...item.songs].reverse().forEach((s: SongMetadata) => addToNext(s));
                } else if (item.path) {
                    addToNext(item as SongMetadata);
                }
            });
        }
        clearSelection();
    };

    const handleAddToPlaylist = async () => {
        const items = getSelectedItems();
        let songsToAdd: SongMetadata[] = [];

        if (selectionType === 'playlist') {
            for (const item of items) {
                try {
                    const songs = await libraryService.getPlaylistSongs(item.id);
                    songsToAdd.push(...songs);
                } catch (e) { console.error(e); }
            }
        } else {
            items.forEach(item => {
                if (item.songs && Array.isArray(item.songs)) {
                    songsToAdd.push(...item.songs);
                } else if (item.path) {
                    songsToAdd.push(item as SongMetadata);
                }
            });
        }

        if (songsToAdd.length > 0) {
            useAddToPlaylistStore.getState().open(songsToAdd);
            clearSelection();
        }
    };

    const handleBatchRemoveFromPlaylist = async () => {
        if (activeOverlay?.type !== 'playlist_detail' || !activeOverlay.data?.id) return;

        const items = getSelectedItems();
        const songIds = items.map(i => i.id).filter(id => typeof id === 'number') as number[];

        if (songIds.length > 0) {
            try {
                await libraryService.batchRemoveFromPlaylist(activeOverlay.data.id, songIds);
                triggerLibraryUpdate();
            } catch (e) {
                console.error('Failed to remove songs from playlist', e);
            }
        }

        clearSelection();
    };

    const handleDelete = async () => {
        const items = getSelectedItems();

        if (selectionType === 'song') {
            const ids = items.map(i => i.id).filter(id => typeof id === 'number') as number[];
            if (ids.length > 0) {
                await libraryService.batchDeleteSongs(ids);
                triggerLibraryUpdate();
            }
        } else if (selectionType === 'album' || selectionType === 'artist') {
            const allSongIds: number[] = [];
            items.forEach(item => {
                if (item.songs && Array.isArray(item.songs)) {
                    item.songs.forEach((s: SongMetadata) => {
                        if (typeof s.id === 'number') allSongIds.push(s.id);
                    });
                }
            });

            if (allSongIds.length > 0) {
                await libraryService.batchDeleteSongs(allSongIds);
                triggerLibraryUpdate();
            }
        } else if (selectionType === 'playlist') {
            const ids = items.map(i => i.id).filter(id => id !== 'favorites');
            for (const id of ids) {
                try {
                    await libraryService.deletePlaylist(Number(id));
                } catch (e) { console.error(e); }
            }
            triggerLibraryUpdate();
        } else if (selectionType === 'file' || selectionType === 'folder' || selectionType === 'recent') {
            items.forEach(item => {
                if (item.id) removeFromRecent(item.id);
            });
        }

        clearSelection();
        setShowDeleteConfirm(false);
    };

    // Batch Favorite Handler
    const handleBatchFavorite = async () => {
        let songsToProcess: SongMetadata[] = [...syncSongs];

        if (selectionType === 'playlist') {
            for (const item of selectedItems) {
                try {
                    const songs = await libraryService.getPlaylistSongs(item.id);
                    songsToProcess.push(...songs);
                } catch (e) { console.error(e); }
            }
        }

        const targetIsFavorite = !isAllFavorited;

        for (const song of songsToProcess) {
            if (song.id && !!song.is_favorite !== targetIsFavorite) {
                try { await libraryService.toggleFavorite(song.id); } catch (e) { }
            }
        }

        triggerLibraryUpdate();
        clearSelection();
    };

    const allActions: ActionItem[] = [
        { id: 'play', icon: MdPlayArrow, label: '播放', onClick: handlePlay, variant: 'primary' },
        {
            id: 'favorite',
            icon: isAllFavorited ? IoHeart : IoHeartOutline,
            label: isAllFavorited ? '取消喜爱' : '喜爱',
            onClick: handleBatchFavorite,
            hideLabel: true
        },
        { id: 'queue', icon: MdPlaylistAdd, label: '加入播放队列', onClick: handleAddToQueue },
        { id: 'add', icon: MdAdd, label: '添加到', onClick: handleAddToPlaylist },
    ];

    // Add "Remove from Playlist" if inside a playlist
    if (activeOverlay?.type === 'playlist_detail') {
        allActions.push({
            id: 'remove-from-playlist',
            icon: MdPlaylistRemove,
            label: '从播放列表移除',
            onClick: handleBatchRemoveFromPlaylist
        });
    }

    allActions.push({
        id: 'delete',
        icon: MdDelete,
        label: '从资料库删除',
        onClick: () => setShowDeleteConfirm(true),
        variant: 'danger'
    });

    const visibleActions = allActions.slice(0, visibleCount);
    const overflowActions = allActions.slice(visibleCount);

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-[90vw]" ref={containerRef}>
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="从资料库删除"
                description={`确定要从资料库中删除选中的 ${count} 项吗？此操作将从资料库中移除，不会删除本地文件。`}
                confirmText="删除"
                type="danger"
            />

            <div className="flex items-center gap-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-2 pl-3 pr-3 rounded-2xl shadow-2xl border border-neutral-200/50 dark:border-neutral-700/50">
                <button
                    onClick={handleToggleAll}
                    className={`p-1.5 rounded-xl transition-all active:scale-90 flex items-center justify-center ${justClickedAll
                        ? 'text-primary'
                        : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                        }`}
                >
                    {justClickedAll ? <IoCheckbox className="text-[22px]" /> : <IoSquareOutline className="text-[22px]" />}
                </button>

                <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900 dark:text-white whitespace-nowrap text-sm">
                        已选择 {count} 项
                    </span>
                    <button
                        onClick={() => clearSelection()}
                        className="p-1 px-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                        <IoClose className="text-lg" />
                    </button>
                </div>

                <div className="h-6 w-px bg-neutral-200 dark:bg-white/10 mx-1 shrink-0" />

                <div className="flex items-center gap-0.5" ref={actionsRef}>
                    {visibleActions.map(action => (
                        <ActionButton
                            key={action.id}
                            icon={action.icon}
                            label={action.label}
                            onClick={action.onClick}
                            variant={action.variant}
                            hideLabel={action.hideLabel}
                        />
                    ))}

                    {overflowActions.length > 0 && (
                        <Menu as="div" className="relative">
                            <MenuButton className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors">
                                <MdMoreHoriz className="text-xl text-neutral-600 dark:text-neutral-300" />
                            </MenuButton>
                            <MenuItems
                                anchor={{ to: 'top end', gap: 9 }}
                                className="w-48 origin-bottom-right rounded-xl border border-neutral-200/50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-1 text-sm shadow-2xl dark:border-neutral-700/50 z-[100]"
                            >
                                {overflowActions.map(action => (
                                    <MenuItem key={action.id}>
                                        <button
                                            onClick={action.onClick}
                                            className={`group flex w-full items-center gap-2 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10 ${action.variant === 'danger' ? 'text-red-600' : 'text-neutral-700 dark:text-neutral-200'
                                                }`}
                                        >
                                            <action.icon className="text-lg" />
                                            {action.label}
                                        </button>
                                    </MenuItem>
                                ))}
                            </MenuItems>
                        </Menu>
                    )}
                </div>
            </div>
        </div>
    );
}

function ActionButton({ icon: Icon, label, onClick, variant = 'default', hideLabel = false }: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'default';
    hideLabel?: boolean;
}) {
    const isPrimary = variant === 'primary';
    const isDanger = variant === 'danger';
    return (
        <button
            onClick={onClick}
            className={`
                flex items-center rounded-xl text-sm font-medium transition-all active:scale-95 whitespace-nowrap
                ${hideLabel ? 'p-2' : 'gap-1.5 px-3 py-2'}
                ${isPrimary
                    ? 'bg-primary text-on-primary shadow-sm hover:brightness-110'
                    : 'hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-200'}
                ${isDanger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : ''}
            `}
        >
            <Icon className="text-lg" title={hideLabel ? label : undefined} />
            {!hideLabel && label}
        </button>
    );
}
