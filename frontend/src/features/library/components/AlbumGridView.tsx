import { IoPlay, IoMusicalNotes } from 'react-icons/io5';
import type { SongMetadata } from '../../../types';

// 定义专辑数据结构
export interface AlbumData {
    name: string;
    artist: string;
    cover: string | null;
    songs: SongMetadata[]; // 包含的歌曲
}

interface AlbumGridViewProps {
    albums: AlbumData[];
    onPlayAlbum: (album: AlbumData) => void;
}

export default function AlbumGridView({ albums, onPlayAlbum }: AlbumGridViewProps) {
    return (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pt-2">
            {albums.map((album) => (
                <div
                    key={album.name + album.artist}
                    onClick={() => onPlayAlbum(album)}
                    className="group flex flex-col gap-3 rounded-xl p-3 -mx-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer"
                >
                    <div className="aspect-square w-full rounded-lg shadow-sm bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative">
                        {album.cover ? (
                            <img src={album.cover} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                <IoMusicalNotes className="text-5xl" />
                            </div>
                        )}

                        {/* 播放遮罩 */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/10">
                            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg text-white translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                <IoPlay className="ml-1" />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-0.5">
                        <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {album.name}
                        </span>
                        <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {album.artist}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}