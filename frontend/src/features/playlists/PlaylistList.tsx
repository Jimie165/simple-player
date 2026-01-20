import { useState, useEffect } from 'react';
import { IoHeart, IoMusicalNotes, IoAdd } from 'react-icons/io5';
import PageContainer from '../../components/layout/PageContainer';
import { libraryService } from '../../services/libraryService';
import type { Playlist } from '../../types';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useNavigationStore } from '../../store/useNavigationStore';
import MusicContextMenu from '../../components/common/MusicContextMenu';
// import CreatePlaylistDialog...

export default function PlaylistList() {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const { push } = useNavigationStore();
    const [deleteId, setDeleteId] = useState<number | null>(null);

    const loadPlaylists = async () => {
        try {
            const list = await libraryService.getPlaylists();
            setPlaylists(list);
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => { loadPlaylists(); }, []);

    const handleDelete = async () => {
        if (deleteId) {
            await libraryService.deletePlaylist(deleteId);
            setDeleteId(null);
            loadPlaylists();
        }
    };

    const handleCreate = async () => {
        // Simple prompt for now, better UI later
        // TODO: Use a proper Dialog
        const name = prompt("请输入播放列表名称");
        if (name) {
            await libraryService.createPlaylist(name);
            loadPlaylists();
        }
    };

    return (
        <PageContainer
            title="播放列表"
            actions={
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-1 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    <IoAdd className="text-lg" />
                    新建
                </button>
            }
        >
            <ConfirmDialog
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={handleDelete}
                title="删除播放列表"
                description="确定要删除此播放列表吗？"
                type="danger"
            />

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pt-2">
                {/* 1. Favorites Card */}
                <div
                    onClick={() => push({ type: 'playlist_detail', data: { id: 'favorites', name: '喜爱歌曲' } })}
                    className="group bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl p-4 flex flex-col justify-between aspect-square cursor-pointer hover:scale-[1.02] transition-transform relative overflow-hidden shadow-lg"
                >
                    <div className="absolute top-4 right-4 bg-white/20 p-2 rounded-full backdrop-blur-sm">
                        <IoHeart className="text-white text-xl" />
                    </div>
                    <div className="mt-auto">
                        <h3 className="text-white font-bold text-xl">喜爱歌曲</h3>
                        <p className="text-white/80 text-sm">自动生成的列表</p>
                    </div>
                </div>

                {/* 2. User Playlists */}
                {playlists.map(pl => (
                    <div
                        key={pl.id}
                        onClick={() => push({ type: 'playlist_detail', data: pl })}
                        className="group bg-neutral-100 dark:bg-neutral-800 rounded-2xl p-4 flex flex-col justify-between aspect-square cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors relative"
                    >
                        <MusicContextMenu
                            type="playlist"
                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                            onDelete={() => setDeleteId(pl.id)}
                            deleteText="删除播放列表"
                        />

                        <div className="flex-1 flex items-center justify-center">
                            <IoMusicalNotes className="text-5xl text-neutral-300 dark:text-neutral-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-neutral-900 dark:text-neutral-100 truncate">{pl.name}</h3>
                            <p className="text-neutral-500 text-xs">{new Date(pl.created_at).toLocaleDateString()}</p>
                        </div>
                    </div>
                ))}
            </div>
        </PageContainer>
    );
}
