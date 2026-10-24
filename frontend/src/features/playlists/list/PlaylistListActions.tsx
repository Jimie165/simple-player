import { MdAdd } from 'react-icons/md';

interface PlaylistListActionsProps {
    setIsCreateOpen: (value: boolean) => void;
}

export default function PlaylistListActions({
    setIsCreateOpen,
}: PlaylistListActionsProps) {
    return (
        <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-[background-color,scale] duration-200 hover:bg-primary/90 active:scale-95 base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container base-theme:dark:hover:bg-on-primary"
        >
            <MdAdd className="text-lg" />
            新建播放列表
        </button>
    );
}
