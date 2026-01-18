import { IoPlay, IoPerson } from 'react-icons/io5';
import type { SongMetadata } from '../../../types';

// 定义艺人数据结构
export interface ArtistData {
    name: string;
    cover: string | null;
    count: number;
    songs: SongMetadata[];
}

interface ArtistGridViewProps {
    artists: ArtistData[];
    onPlayArtist: (artist: ArtistData) => void;
}

export default function ArtistGridView({ artists, onPlayArtist }: ArtistGridViewProps) {
    return (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pt-2">
            {artists.map((artist) => (
                <div
                    key={artist.name}
                    onClick={() => onPlayArtist(artist)}
                    className="group flex flex-col items-center gap-3 rounded-xl p-4 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer text-center"
                >
                    <div className="aspect-square w-40 rounded-full shadow-sm bg-neutral-200 dark:bg-neutral-700 overflow-hidden relative mx-auto">
                        {artist.cover ? (
                            <img src={artist.cover} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                <IoPerson className="text-5xl" />
                            </div>
                        )}

                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/10">
                            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg text-white">
                                <IoPlay className="ml-1" />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-0.5">
                        <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {artist.name}
                        </span>
                        <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {artist.count} 首歌
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}