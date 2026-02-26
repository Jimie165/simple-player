import clsx from 'clsx';
import { MdMusicNote, MdAlbum, MdPerson, MdShuffle } from 'react-icons/md';
import type { SongMetadata } from '@/types';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type { ArtistData } from '@/features/library/components/ArtistGridView';

interface LibraryTabsAndShuffleProps {
    currentTab: 'songs' | 'albums' | 'artists';
    onTabChange: (tab: 'songs' | 'albums' | 'artists') => void;
    librarySongs: SongMetadata[];
    albums: AlbumData[];
    artists: ArtistData[];
    onShufflePlay: (songs: SongMetadata[]) => void;
}

export default function LibraryTabsAndShuffle({
    currentTab,
    onTabChange,
    librarySongs,
    albums,
    artists,
    onShufflePlay,
}: LibraryTabsAndShuffleProps) {
    return (
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
                {[
                    { id: 'songs', label: '歌曲', icon: MdMusicNote },
                    { id: 'albums', label: '专辑', icon: MdAlbum },
                    { id: 'artists', label: '艺人', icon: MdPerson },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id as 'songs' | 'albums' | 'artists')}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                            currentTab === tab.id
                                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                        )}
                    >
                        <tab.icon className="text-lg" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <button
                onClick={() => {
                    let songsToPlay: SongMetadata[] = [];
                    if (currentTab === 'songs') {
                        songsToPlay = [...librarySongs];
                    } else if (currentTab === 'albums' && albums.length > 0) {
                        songsToPlay = albums.flatMap(a => a.songs);
                    } else if (currentTab === 'artists' && artists.length > 0) {
                        songsToPlay = artists.flatMap(a => a.songs);
                    }

                    if (songsToPlay.length > 0) {
                        onShufflePlay(songsToPlay);
                    }
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-on-primary font-medium text-sm transition-colors shadow-sm active:scale-95"
            >
                <MdShuffle className="text-lg" />
                随机播放
            </button>
        </div>
    );
}
