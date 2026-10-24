import clsx from 'clsx';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
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
    sortControl: ReactNode;
}

export default function LibraryTabsAndShuffle({
    currentTab,
    onTabChange,
    librarySongs,
    albums,
    artists,
    onShufflePlay,
    sortControl,
}: LibraryTabsAndShuffleProps) {
    return (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 pb-2">
            <div
                role="tablist"
                aria-label="音乐库分类"
                className="relative inline-flex items-center gap-1 rounded-full p-1 bg-on-surface/5 dark:bg-on-surface/10 border border-outline-variant/20 backdrop-blur-md shadow-inner"
            >
                {[
                    { id: 'songs', label: '歌曲', icon: MdMusicNote },
                    { id: 'albums', label: '专辑', icon: MdAlbum },
                    { id: 'artists', label: '艺人', icon: MdPerson },
                ].map((tab) => {
                    const selected = currentTab === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => onTabChange(tab.id as 'songs' | 'albums' | 'artists')}
                            className={clsx(
                                'relative flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                                selected
                                    ? 'text-primary dark:text-primary'
                                    : 'text-on-surface-variant hover:text-on-surface'
                            )}
                        >
                            {selected && (
                                <motion.span
                                    layoutId="library-active-tab-indicator"
                                    className="absolute inset-0 rounded-full bg-surface dark:bg-surface-container-high shadow-sm border border-outline-variant/15"
                                    transition={{ type: 'spring', duration: 0.35, bounce: 0.18 }}
                                />
                            )}
                            <Icon className="relative z-10 text-lg" />
                            <span className="relative z-10">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="ml-auto flex items-center gap-2">
                {sortControl}
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
                    className="flex h-10 items-center gap-2 px-4 rounded-full bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container hover:bg-primary/90 base-theme:dark:hover:bg-on-primary text-on-primary font-medium text-sm transition-colors shadow-sm active:scale-95"
                >
                    <MdShuffle className="text-lg" />
                    随机播放
                </button>
            </div>
        </div>
    );
}
