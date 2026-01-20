
import { useState, useRef, useEffect } from 'react';
import { useSelectionStore } from '../../store/useSelectionStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { audioService } from '../../services/audioService';
import { libraryService } from '../../services/libraryService';
import { MdPlayArrow, MdPlaylistAdd, MdAdd, MdDelete, MdMoreHoriz } from 'react-icons/md';
import { IoClose } from 'react-icons/io5';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import type { SongMetadata } from '../../types';

interface ActionItem {
    id: string;
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'default';
}

export default function SelectionActionBar() {
    const { isSelectionMode, selectedIds, selectionType, clearSelection, selectedItemsMap } = useSelectionStore();
    const { setPlaylist, setCurrentSongIndex, addToNext, removeFromRecent, triggerLibraryUpdate } = useLibraryStore();
    const { setIsPlaying, setMetadata, setShuffleState } = usePlayerStore();

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [visibleCount, setVisibleCount] = useState(4);
    const containerRef = useRef<HTMLDivElement>(null);
    const actionsRef = useRef<HTMLDivElement>(null);

    // Calculate how many actions fit
    useEffect(() => {
        const calculateVisibleCount = () => {
            if (!containerRef.current || !actionsRef.current) return;
            const containerWidth = containerRef.current.offsetWidth;
            // Estimate: each button ~120px, count section ~150px, more button ~50px
            const availableWidth = containerWidth - 180; // Reserve space for count and close
            const buttonWidth = 110;
            const count = Math.floor(availableWidth / buttonWidth);
            setVisibleCount(Math.max(1, Math.min(count, 4)));
        };

        calculateVisibleCount();
        window.addEventListener('resize', calculateVisibleCount);
        return () => window.removeEventListener('resize', calculateVisibleCount);
    }, [isSelectionMode]);

    if (!isSelectionMode) return null;

    const count = selectedIds.size;

    // Helper to get actual objects from the store's map
    const getSelectedItems = (): any[] => {
        if (!selectedItemsMap) return [];
        return Array.from(selectedIds).map(id => selectedItemsMap.get(id)).filter(Boolean);
    };

    const handlePlay = async () => {
        const items = getSelectedItems();
        if (items.length === 0) return;

        let songsToPlay: SongMetadata[] = [];

        for (const item of items) {
            if (selectionType === 'song' || selectionType === 'file' || item.type === 'file') {
                // Check if it's a SongMetadata-like object
                if (item.path) {
                    songsToPlay.push(item as SongMetadata);
                }
            } else if (selectionType === 'album' || selectionType === 'artist' || item.type === 'album') {
                if (item.songs && Array.isArray(item.songs)) {
                    songsToPlay.push(...item.songs);
                }
            } else if (selectionType === 'recent') {
                // Handle mixed recent items
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
        }
    };

    const handleAddToQueue = () => {
        const items = getSelectedItems();
        items.forEach(item => {
            if (item.songs && Array.isArray(item.songs)) {
                [...item.songs].reverse().forEach((s: SongMetadata) => addToNext(s));
            } else if (item.path) {
                addToNext(item as SongMetadata);
            }
        });
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
        } else if (selectionType === 'file' || selectionType === 'folder' || selectionType === 'recent') {
            items.forEach(item => {
                if (item.id) removeFromRecent(item.id);
            });
        }

        clearSelection();
        setShowDeleteConfirm(false);
    };

    const allActions: ActionItem[] = [
        { id: 'play', icon: MdPlayArrow, label: '播放', onClick: handlePlay, variant: 'primary' },
        { id: 'queue', icon: MdPlaylistAdd, label: '加入播放队列', onClick: handleAddToQueue },
        { id: 'add', icon: MdAdd, label: '添加到', onClick: () => console.log('Add to... (Future Feature)') },
        { id: 'delete', icon: MdDelete, label: '删除', onClick: () => setShowDeleteConfirm(true), variant: 'danger' },
    ];

    const visibleActions = allActions.slice(0, visibleCount);
    const overflowActions = allActions.slice(visibleCount);

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-[90vw]" ref={containerRef}>
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="删除选中项"
                description={`确定要删除选中的 ${count} 项吗？此操作将从音乐库中移除，不会删除本地文件。`}
                confirmText="删除"
                type="danger"
            />

            <div className="flex items-center gap-2 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-2 pl-3 pr-2 rounded-2xl shadow-2xl border border-neutral-200/50 dark:border-neutral-700/50">
                {/* Close Button */}
                <button
                    onClick={() => clearSelection()}
                    className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors shrink-0"
                >
                    <IoClose className="text-xl text-neutral-500" />
                </button>

                {/* Count */}
                <span className="font-semibold text-neutral-900 dark:text-white whitespace-nowrap text-sm">
                    已选择 {count} 项
                </span>

                <div className="h-6 w-px bg-neutral-200 dark:bg-white/10 mx-1 shrink-0" />

                {/* Actions */}
                <div className="flex items-center gap-0.5" ref={actionsRef}>
                    {visibleActions.map(action => (
                        <ActionButton
                            key={action.id}
                            icon={action.icon}
                            label={action.label}
                            onClick={action.onClick}
                            variant={action.variant}
                        />
                    ))}

                    {/* Overflow Menu */}
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

function ActionButton({ icon: Icon, label, onClick, variant = 'default' }: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'default';
}) {
    const isPrimary = variant === 'primary';
    const isDanger = variant === 'danger';
    return (
        <button
            onClick={onClick}
            className={`
                flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 whitespace-nowrap
                ${isPrimary
                    ? 'bg-primary text-on-primary shadow-sm hover:brightness-110'
                    : 'hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-200'}
                ${isDanger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : ''}
            `}
        >
            <Icon className="text-lg" />
            {label}
        </button>
    );
}
