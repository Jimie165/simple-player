import SharedCover from '@/components/common/SharedCover';
import { getCoverTransitionSource } from '@/utils/viewTransition';
import { MdCheck } from 'react-icons/md';
import favoritesCover from '@/assets/favorites-cover.svg';
import clsx from 'clsx';
import type { Playlist } from '@/types';
import type { PlaylistDetailState } from '@/store/useNavigationStore';
import { getMusicItemId } from '@/utils/musicItemUtils';
import CardPlayButton from '@/components/common/CardPlayButton';
import PlaylistCoverCollage from '@/components/common/PlaylistCoverCollage';
import CoverImage from '@/components/common/CoverImage';
import { FavoritesCardMenu, PlaylistCardMenu } from '@/features/playlists/list/PlaylistCardMenus';
import { useMainContentWidth } from '@/hooks/useMainContentWidth';
import { getSparseGridBreakpoints, getSparseGridStyle } from '@/utils/gridLayout';
import VirtualizedGrid from '@/components/common/VirtualizedGrid';

type PlaylistGridItem = Playlist | (Omit<Playlist, 'id'> & { id: 'favorites' | 'playlist:favorites' });

interface PlaylistCardsGridProps {
    filteredPlaylists: PlaylistGridItem[];
    favoritesCount: number;
    isSelectionMode: boolean;
    selectedIds: Set<string>;
    toggleSelection: (id: string, type: 'playlist', data: unknown) => void;
    toggleSelectionMode: (item: { id: string; type: 'playlist'; data: unknown }) => void;
    onOpenPlaylist: (detail: PlaylistDetailState) => void;
    handlePlayFavorites: (shuffle?: boolean) => void;
    handleAddFavoritesToQueue: () => void;
    handlePlayPlaylist: (pl: Playlist, shuffle?: boolean) => Promise<void>;
    handleAddToQueue: (pl: Playlist) => Promise<void>;
    setEditPlaylist: (pl: Playlist) => void;
    setContextMenu: (value: { x: number; y: number; playlist: Playlist } | null) => void;
    setFavoritesContextMenu: (value: { x: number; y: number } | null) => void;
    playlistCoverPaths: Record<number, string[]>;
}

export default function PlaylistCardsGrid({
    filteredPlaylists,
    favoritesCount,
    isSelectionMode,
    selectedIds,
    toggleSelection,
    toggleSelectionMode,
    onOpenPlaylist,
    handlePlayFavorites,
    handleAddFavoritesToQueue,
    handlePlayPlaylist,
    handleAddToQueue,
    setEditPlaylist,
    setContextMenu,
    setFavoritesContextMenu,
    playlistCoverPaths,
}: PlaylistCardsGridProps) {
    const mainContentWidth = useMainContentWidth(getSparseGridBreakpoints(filteredPlaylists.length, 'cover'));

    return (
        <VirtualizedGrid
            data={filteredPlaylists}
            itemKey={(_index, playlist) => getMusicItemId(playlist)}
            listClassName="grid content-grid-cover gap-6 pb-8"
            listStyle={getSparseGridStyle(mainContentWidth, filteredPlaylists.length, 24, 'cover')}
            itemContent={(_index, pl) => {
                if (pl.id === 'favorites' || pl.id === 'playlist:favorites') {
                    const favoritesSelectionId = getMusicItemId(pl);
                    const isSelected = selectedIds.has(favoritesSelectionId);
                    return (
                        <div
                            key="favorites"
                            onClick={(event) => {
                                if (isSelectionMode) {
                                    toggleSelection(favoritesSelectionId, 'playlist', pl);
                                } else {
                                    onOpenPlaylist({ id: 'favorites', name: '喜爱歌曲', transitionSource: getCoverTransitionSource(event.currentTarget) });
                                }
                            }}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu(null);
                                setFavoritesContextMenu({ x: e.clientX, y: e.clientY });
                            }}
                            className="group flex flex-col gap-3 cursor-pointer"
                        >
                            <SharedCover data-transition-cover="playlist-cover-favorites" layoutId="playlist-cover-favorites"
                                className="relative aspect-square rounded-xl overflow-hidden bg-linear-to-br from-red-500 to-pink-600 shadow-sm group-hover:shadow-md transition-shadow"
                            >
                                <img src={favoritesCover} alt="" loading="eager" decoding="sync" className="w-full h-full object-cover" />

                                {isSelectionMode && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSelection(favoritesSelectionId, 'playlist', pl);
                                        }}
                                        className={clsx(
                                            'absolute top-2 left-2 z-30 w-6 h-6 rounded-md flex items-center justify-center transition-all shadow-md cursor-pointer',
                                            isSelected
                                                ? 'bg-white text-primary opacity-100'
                                                : 'bg-black/20 backdrop-blur-md text-white border border-white/30 opacity-100'
                                        )}
                                    >
                                        {isSelected ? <MdCheck className="text-lg" /> : null}
                                    </div>
                                )}

                                <div className={clsx(
                                    'absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent transition-opacity duration-300 rounded-xl',
                                    !isSelectionMode ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'
                                )}>
                                    {!isSelectionMode && (
                                        <>
                                            <CardPlayButton variant="cover"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePlayFavorites();
                                                }}
                                            />
                                            <FavoritesCardMenu
                                                handlePlayFavorites={handlePlayFavorites}
                                                handleAddFavoritesToQueue={handleAddFavoritesToQueue}
                                                setFavoritesContextMenu={setFavoritesContextMenu}
                                                setContextMenu={setContextMenu}
                                                toggleSelectionMode={toggleSelectionMode}
                                                toggleSelection={toggleSelection}
                                                isSelectionMode={isSelectionMode}
                                                isSelected={isSelected}
                                            />
                                        </>
                                    )}
                                </div>
                                {isSelectionMode && (
                                    <div className="absolute inset-0 bg-black/10 transition-opacity pointer-events-none" />
                                )}
                            </SharedCover>
                            <div>
                                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-[15px] group-hover:text-primary transition-colors">
                                    喜爱歌曲
                                </h3>
                                <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
                                    <span>{favoritesCount} 首歌曲</span>
                                </div>
                            </div>
                        </div>
                    );
                }

                const playlist = pl as Playlist;
                const id = getMusicItemId(playlist);
                const isSelected = selectedIds.has(id);
                return (
                    <div
                        key={playlist.id}
                        onClick={(event) => {
                            if (isSelectionMode) {
                                toggleSelection(id, 'playlist', playlist);
                            } else {
                                onOpenPlaylist({ id: playlist.id, name: playlist.name, transitionSource: getCoverTransitionSource(event.currentTarget) });
                            }
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setFavoritesContextMenu(null);
                            setContextMenu({ x: e.clientX, y: e.clientY, playlist });
                        }}
                        className="group flex flex-col gap-3 cursor-pointer"
                    >
                        <SharedCover data-transition-cover={`playlist-cover-${playlist.id}`} layoutId={`playlist-cover-${playlist.id}`} className="relative aspect-square rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 shadow-sm group-hover:shadow-md transition-shadow">
                            {playlist.cover_path ? (
                                <CoverImage src={playlist.cover_path} className="w-full h-full object-cover" />
                            ) : (
                                <PlaylistCoverCollage
                                    songs={[]}
                                    coverPaths={playlistCoverPaths[playlist.id] || []}
                                />
                            )}

                            {isSelectionMode && (
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelection(id, 'playlist', playlist);
                                    }}
                                    className={clsx(
                                        'absolute top-2 left-2 z-30 w-6 h-6 rounded-md flex items-center justify-center transition-all shadow-md cursor-pointer',
                                        isSelected
                                            ? 'bg-primary text-on-primary opacity-100'
                                            : 'bg-black/20 backdrop-blur-md text-white border border-white/30 opacity-100'
                                    )}
                                >
                                    {isSelected ? <MdCheck className="text-lg" /> : null}
                                </div>
                            )}

                            {!isSelectionMode && (
                                <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <CardPlayButton variant="cover"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handlePlayPlaylist(playlist);
                                        }}
                                    />
                                    <PlaylistCardMenu
                                        pl={playlist}
                                        handlePlayPlaylist={handlePlayPlaylist}
                                        handleAddToQueue={handleAddToQueue}
                                        setEditPlaylist={setEditPlaylist}
                                        setContextMenu={setContextMenu}
                                        setFavoritesContextMenu={setFavoritesContextMenu}
                                        toggleSelectionMode={toggleSelectionMode}
                                        toggleSelection={toggleSelection}
                                        isSelectionMode={isSelectionMode}
                                        isSelected={isSelected}
                                    />
                                </div>
                            )}

                            {isSelectionMode && (
                                <div className="absolute inset-0 bg-primary/10 transition-opacity" />
                            )}
                        </SharedCover>

                        <div>
                            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-[15px] group-hover:text-primary transition-colors">
                                {playlist.name}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
                                <span>{playlist.song_count || 0} 首歌曲</span>
                            </div>
                        </div>
                    </div>
                );
            }}
        />
    );
}
