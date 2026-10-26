import { MdAdd } from 'react-icons/md';
import { useSelectionStore } from '@/store/useSelectionStore';

interface PlaylistListActionsProps {
    setIsCreateOpen: (value: boolean) => void;
}

export default function PlaylistListActions({
    setIsCreateOpen,
}: PlaylistListActionsProps) {
    const disabled = useSelectionStore(state => state.isSelectionMode);
    return (
        <button
            disabled={disabled}
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-[background-color,scale] duration-200 hover:bg-primary/90 active:scale-95 base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container base-theme:dark:hover:bg-on-primary disabled:opacity-40 disabled:pointer-events-none"
        >
            <MdAdd className="text-lg" />
            新建播放列表
        </button>
    );
}
