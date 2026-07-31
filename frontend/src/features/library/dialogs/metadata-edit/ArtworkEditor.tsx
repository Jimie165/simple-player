import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { MdAdd, MdDeleteOutline } from 'react-icons/md';
import CoverImage from '@/components/common/CoverImage';
import CursorContextMenu from '@/components/common/CursorContextMenu';
import { getSelectedPath } from '@/utils/dialogSelection';
import type { SongMetadata } from '@/types';

interface ArtworkEditorProps {
    song?: SongMetadata;
    coverPath: string | null;
    hasCustomArtwork: boolean;
    hasMixedCovers?: boolean;
    removeMenuId: string;
    onSelect: (path: string) => void;
    onRemove: () => void;
    onError: (message: string) => void;
}

interface MenuPosition {
    x: number;
    y: number;
}

export default function ArtworkEditor({
    song,
    coverPath,
    hasCustomArtwork,
    hasMixedCovers = false,
    removeMenuId,
    onSelect,
    onRemove,
    onError,
}: ArtworkEditorProps) {
    const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

    const handleSelect = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: '图片',
                    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
                }],
            });
            const selectedPath = getSelectedPath(selected);
            if (selectedPath) {
                onSelect(selectedPath);
                onError('');
            }
        } catch (error) {
            console.error('Failed to select artwork', error);
            onError('选择封面失败');
        }
    };

    const handleRemove = () => {
        onRemove();
        setMenuPosition(null);
        onError('');
    };

    return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center">
            <div className="w-[min(430px,100%)]">
                <div
                    className="relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 shadow-sm dark:border-white/10 dark:bg-neutral-800"
                    onContextMenu={(event) => {
                        event.preventDefault();
                        if (hasCustomArtwork) {
                            setMenuPosition({ x: event.clientX, y: event.clientY });
                        }
                    }}
                >
                    <CoverImage
                        song={song}
                        src={coverPath}
                        className="h-full w-full"
                        iconClassName="text-6xl"
                        thumbnail={false}
                        fallbackToSongCover={false}
                    />
                    {hasMixedCovers && (
                        <span className="absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
                            多个封面
                        </span>
                    )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                    {hasCustomArtwork ? (
                        <button
                            type="button"
                            onClick={handleRemove}
                            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[15px] font-medium text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                        >
                            <MdDeleteOutline className="text-[20px]" />
                            移除封面
                        </button>
                    ) : (
                        <div />
                    )}
                    <button
                        type="button"
                        onClick={handleSelect}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[15px] font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                        <MdAdd className="text-[24px]" />
                        添加封面
                    </button>
                </div>
            </div>

            {menuPosition && (
                <CursorContextMenu
                    x={menuPosition.x}
                    y={menuPosition.y}
                    onClose={() => setMenuPosition(null)}
                    menuGroups={[[{
                        id: removeMenuId,
                        label: '移除封面',
                        icon: MdDeleteOutline,
                        variant: 'danger',
                        onClick: handleRemove,
                    }]]}
                />
            )}
        </div>
    );
}
