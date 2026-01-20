import { IoMusicalNotes } from 'react-icons/io5';

export default function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
            <IoMusicalNotes className="text-6xl mb-4 opacity-20" />
            <p>暂无播放记录，快去打开一些文件吧</p>
        </div>
    );
}