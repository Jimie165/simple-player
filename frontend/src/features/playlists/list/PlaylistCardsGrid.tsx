import { MdCheck, MdFavorite } from 'react-icons/md';
import clsx from 'clsx';
import type { Playlist, SongMetadata } from '@/types';
import { getMusicItemId } from '@/utils/musicItemUtils';
import CardPlayButton from '@/components/common/CardPlayButton';
import PlaylistCoverCollage from '@/components/common/PlaylistCoverCollage';
import CoverImage from '@/components/common/CoverImage';
import { sortSongs } from '@/utils/songSort';
import { FavoritesCardMenu, PlaylistCardMenu } from '@/features/playlists/list/PlaylistCardMenus';

interface PlaylistCardsGridProps {
    filteredPlaylists: Playlist[];
    favoritesCount: number;
    isSelectionMode: boolean;
    selectedIds: Set<string>;
    toggleSelection: (id: string, type: 'playlist', data: any) => void;
    toggleSelectionMode: (item: { id: string; type: 'playlist'; data: any }) => void;
    push: (entry: any) => void;
    handlePlayFavorites: (shuffle?: boolean) => void;
    handleAddFavoritesToQueue: () => void;
    handlePlayPlaylist: (pl: Playlist, shuffle?: boolean) => Promise<void>;
    handleAddToQueue: (pl: Playlist) => Promise<void>;
    setEditPlaylist: (pl: Playlist) => void;
    setContextMenu: (value: { x: number; y: number; playlist: Playlist } | null) => void;
    setFavoritesContextMenu: (value: { x: number; y: number } | null) => void;
    getPlaylistSettings: (playlistId: string) => { sortKey: any; sortOrder: any };
    playlistSongs: Record<number, SongMetadata[]>;
}

export default function PlaylistCardsGrid({
    filteredPlaylists,
    favoritesCount,
    isSelectionMode,
    selectedIds,
    toggleSelection,
    toggleSelectionMode,
    push,
    handlePlayFavorites,
    handleAddFavoritesToQueue,
    handlePlayPlaylist,
    handleAddToQueue,
    setEditPlaylist,
    setContextMenu,
    setFavoritesContextMenu,
    getPlaylistSettings,
    playlistSongs,
}: PlaylistCardsGridProps) {
    return (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pb-8">
            {filteredPlaylists.map(pl => {
                if (pl.id === 'favorites' as any) {
                    const favoritesSelectionId = getMusicItemId(pl);
                    const isSelected = selectedIds.has(favoritesSelectionId);
                    return (
                        <div
                            key="favorites"
                            onClick={() => {
                                if (isSelectionMode) {
                                    toggleSelection(favoritesSelectionId, 'playlist', pl);
                                } else {
                                    push({ type: 'playlist_detail', data: { id: 'favorites', name: '喜爱歌曲' } });
                                }
                            }}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu(null);
                                setFavoritesContextMenu({ x: e.clientX, y: e.clientY });
                            }}
                            className="group relative aspect-square cursor-pointer transition-transform hover:scale-[1.02] rounded-2xl overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl shadow-lg shadow-red-900/20" />

                            <div className="absolute inset-0 p-5 flex flex-col justify-between">
                                <div className="flex justify-end">
                                    <div className="bg-white/20 p-2.5 rounded-full backdrop-blur-sm">
                                        <MdFavorite className="text-white text-xl" />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-white font-bold text-2xl tracking-tight">喜爱歌曲</h3>
                                    <p className="text-white/80 text-sm mt-1 font-medium">{favoritesCount} 首歌曲</p>
                                </div>
                            </div>

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
                                'absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent transition-opacity duration-300 rounded-2xl',
                                !isSelectionMode ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'
                            )}>
                                {!isSelectionMode && (
                                    <>
                                        <CardPlayButton
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
                        </div>
                    );
                }

                const id = getMusicItemId(pl);
                const isSelected = selectedIds.has(id);
                return (
                    <div
                        key={pl.id}
                        onClick={() => {
                            if (isSelectionMode) {
                                toggleSelection(id, 'playlist', pl);
                            } else {
                                push({ type: 'playlist_detail', data: pl });
                            }
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setFavoritesContextMenu(null);
                            setContextMenu({ x: e.clientX, y: e.clientY, playlist: pl });
                        }}
                        className="group flex flex-col gap-3 cursor-pointer"
                    >
                        <div className="relative aspect-square rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 shadow-sm group-hover:shadow-md transition-all">
                            {pl.cover_path ? (
                                <CoverImage src={pl.cover_path} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            ) : (
                                <PlaylistCoverCollage
                                    songs={(() => {
                                        const rawSongs = playlistSongs[pl.id] || [];
                                        const settings = getPlaylistSettings(pl.id.toString());
                                        return sortSongs(rawSongs, settings.sortKey, settings.sortOrder);
                                    })()}
                                    className="transition-transform duration-500 group-hover:scale-105"
                                />
                            )}

                            {isSelectionMode && (
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelection(id, 'playlist', pl);
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
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <CardPlayButton
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handlePlayPlaylist(pl);
                                        }}
                                    />
                                    <PlaylistCardMenu
                                        pl={pl}
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
                        </div>

                        <div>
                            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-[15px] group-hover:text-primary transition-colors">
                                {pl.name}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
                                <span>{pl.song_count || 0} 首歌曲</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
