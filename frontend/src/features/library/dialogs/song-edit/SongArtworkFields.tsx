import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { MdAdd, MdDeleteOutline } from 'react-icons/md';
import CoverImage from '@/components/common/CoverImage';
import CursorContextMenu from '@/components/common/CursorContextMenu';
import { getSelectedPath } from '@/utils/dialogSelection';
import type { SongMetadata } from '@/types';

interface SongArtworkFieldsProps {
    song: SongMetadata;
    artworkSourcePath: string | null;
    removeArtwork: boolean;
    onChange: (patch: { artworkSourcePath: string | null; removeArtwork: boolean }) => void;
    onError: (message: string) => void;
}

interface MenuPosition {
    x: number;
    y: number;
}

export default function SongArtworkFields({
    song,
    artworkSourcePath,
    removeArtwork,
    onChange,
    onError,
}: SongArtworkFieldsProps) {
    const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
    const displayedCoverPath = artworkSourcePath
        ?? (removeArtwork ? song.embedded_cover_path : song.cover_path)
        ?? null;
    const hasCustomArtwork = Boolean(
        artworkSourcePath || (!removeArtwork && song.artwork_path)
    );

    const handleSelectArtwork = async () => {
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
                onChange({ artworkSourcePath: selectedPath, removeArtwork: false });
                onError('');
            }
        } catch (error) {
            console.error('Failed to select song artwork', error);
            onError('选择封面失败');
        }
    };

    const handleRemoveArtwork = () => {
        onChange({
            artworkSourcePath: null,
            removeArtwork: Boolean(song.artwork_path),
        });
        setMenuPosition(null);
        onError('');
    };

    return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center">
            <div className="w-[min(430px,100%)]">
                <div
                    className="aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 shadow-sm dark:border-white/10 dark:bg-neutral-800"
                    onContextMenu={(event) => {
                        event.preventDefault();
                        if (hasCustomArtwork) {
                            setMenuPosition({ x: event.clientX, y: event.clientY });
                        }
                    }}
                >
                    <CoverImage
                        song={song}
                        src={displayedCoverPath}
                        className="h-full w-full"
                        iconClassName="text-6xl"
                        thumbnail={false}
                        fallbackToSongCover={false}
                    />
                </div>

                <div className="mt-4 flex items-center justify-between">
                    {hasCustomArtwork ? (
                        <button
                            type="button"
                            onClick={handleRemoveArtwork}
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
                        onClick={handleSelectArtwork}
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
                        id: 'remove-artwork',
                        label: '移除封面',
                        icon: MdDeleteOutline,
                        variant: 'danger',
                        onClick: handleRemoveArtwork,
                    }]]}
                />
            )}
        </div>
    );
}
