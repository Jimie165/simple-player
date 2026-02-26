import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { MdFolder, MdCheckBox, MdCheckBoxOutlineBlank, MdFavorite, MdVideocam } from 'react-icons/md';
import PageContainer from '@/components/layout/PageContainer';
import OpenFileMenu from '@/features/home/components/OpenFileMenu';
import EmptyState from '@/features/home/components/EmptyState';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { libraryService } from '@/services/libraryService';

import type { RecentItem } from '@/types';
import type { SongMetadata } from '@/types';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import CoverImage from '@/components/common/CoverImage';
import PlaylistCoverCollage from '@/components/common/PlaylistCoverCollage';
import { sortSongs } from '@/utils/songSort';

import CardPlayButton from '@/components/common/CardPlayButton';
import { useRecentPlayback } from '@/features/home/hooks/useRecentPlayback';

interface MusicGridProps {
    onNavigateToLibrary?: () => void;
}

/**
 * 专门为最近播放列表定义的封面组件，负责内部加载歌曲数据以生成拼接封面
 */
function PlaylistGridCover({ item }: { item: RecentItem }) {
    const [songs, setSongs] = useState<SongMetadata[]>([]);
    const { getPlaylistSettings, libraryVersion } = useLibraryStore();

    useEffect(() => {
        const load = async () => {
            const plIdStr = item.id.replace('playlist:', '');
            let plSongs: SongMetadata[] = [];
            if (plIdStr === 'favorites') {
                plSongs = await libraryService.getFavorites();
            } else {
                const plId = parseInt(plIdStr);
                if (!isNaN(plId)) {
                    const raw = await libraryService.getPlaylistSongs(plId);
                    const settings = getPlaylistSettings(plIdStr);
                    plSongs = sortSongs(raw, settings.sortKey, settings.sortOrder);
                }
            }
            setSongs(plSongs);
        };
        load();
    }, [item.id, getPlaylistSettings, libraryVersion]);

    return <PlaylistCoverCollage songs={songs} className="w-full h-full" />;
}

export default function MusicGrid({ onNavigateToLibrary: _onNavigateToLibrary }: MusicGridProps) {
    // Store Actions
    const { recentHistory } = useLibraryStore();
    const { isSelectionMode, selectedIds, toggleSelection, toggleSelectionMode, selectAllRequested, setSelectAllRequested, selectAll, setSelectableIds } = useSelectionStore();
    const {
        contextMenu,
        setContextMenu,
        pendingFolderPlay,
        setPendingFolderPlay,
        isVideoFile,
        handleContextMenu,
        handleItemClick,
        handleOpenFolder,
        handleOpenFile,
        buildFolderRecentItem,
        playVideoList,
        playAudioList,
    } = useRecentPlayback();

    useEffect(() => {
        if (selectAllRequested && isSelectionMode) {
            const items = recentHistory.map(item => ({ id: item.id, data: item }));
            selectAll(items, 'recent');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, recentHistory, selectAll, setSelectAllRequested]);

    useEffect(() => {
        if (!isSelectionMode) return;
        setSelectableIds(recentHistory.map(item => item.id));
    }, [isSelectionMode, recentHistory, setSelectableIds]);

    return (
        <PageContainer
            title="主页"
            actions={<OpenFileMenu onOpenFile={handleOpenFile} onOpenFolder={handleOpenFolder} />}
        >
            <section>
                {pendingFolderPlay && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-2xl bg-white/90 dark:bg-neutral-900/90 border border-neutral-200/70 dark:border-neutral-700/70 shadow-2xl p-5">
                            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                                检测到混合媒体
                            </h3>
                            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
                                该文件夹同时包含视频和音乐，请选择播放类型。
                            </p>
                            <div className="mt-4 flex gap-3">
                                <button
                                    onClick={async () => {
                                        const { folderPath, folderName, videoSongs } = pendingFolderPlay;
                                        setPendingFolderPlay(null);
                                        const recentItem = buildFolderRecentItem(folderPath, folderName, videoSongs, "个视频");
                                        await playVideoList(videoSongs, recentItem);
                                    }}
                                    className="flex-1 rounded-xl bg-primary text-on-primary px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
                                >
                                    播放视频
                                </button>
                                <button
                                    onClick={async () => {
                                        const { folderPath, folderName, audioSongs } = pendingFolderPlay;
                                        setPendingFolderPlay(null);
                                        const recentItem = buildFolderRecentItem(folderPath, folderName, audioSongs, "首歌曲");
                                        await playAudioList(audioSongs, recentItem);
                                    }}
                                    className="flex-1 rounded-xl bg-neutral-200/80 dark:bg-neutral-800/80 text-neutral-800 dark:text-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                >
                                    播放音乐
                                </button>
                            </div>
                            <button
                                onClick={() => setPendingFolderPlay(null)}
                                className="mt-3 w-full rounded-xl px-4 py-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                )}
                <h2 className="mb-4 text-xl font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                    <span>最近使用</span>
                </h2>

                {recentHistory.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                        {recentHistory.map((item) => {
                            const isSelected = selectedIds.has(item.id);

                            return (
                                <div
                                    key={item.id}
                                    className="group flex flex-col gap-3 rounded-2xl p-4 -mx-4 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer relative"
                                    onClick={(e) => handleItemClick(item, e)}
                                    onContextMenu={(e) => handleContextMenu(e, item)}
                                >
                                    <div className="aspect-square w-full rounded-2xl shadow-sm bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative border border-black/5 dark:border-white/5 flex items-center justify-center">
                                        {item.type === 'folder' ? (
                                            <MdFolder className="text-6xl text-blue-400 opacity-80" />
                                        ) : item.type === 'video' ? (
                                            item.cover_path ? (
                                                <CoverImage
                                                    src={item.cover_path}
                                                    className="w-full h-full group-hover:scale-110 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
                                                    <MdVideocam className="text-6xl text-neutral-600" />
                                                </div>
                                            )
                                        ) : item.type === 'playlist' ? (
                                            item.id === 'playlist:favorites' ? (
                                                <div className="w-full h-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
                                                    <MdFavorite className="text-6xl text-white drop-shadow-md" />
                                                </div>
                                            ) : item.cover_path ? (
                                                <CoverImage src={item.cover_path} className="w-full h-full" />
                                            ) : (
                                                <PlaylistGridCover item={item} />
                                            )
                                        ) : (
                                            <CoverImage
                                                song={{
                                                    title: item.title,
                                                    artist: item.artist || '',
                                                    album: '',
                                                    duration: 0,
                                                    path: item.path,
                                                    cover: null,
                                                    cover_path: item.cover_path
                                                }}
                                                className="w-full h-full group-hover:scale-[1.02] transition-transform duration-500 ease-out"
                                                iconClassName="text-6xl opacity-50"
                                            />
                                        )}

                                        {isSelected && (
                                            <div className="absolute inset-0 bg-black/40 z-10 transition-opacity duration-300" />
                                        )}

                                        {isSelectionMode && (
                                            <div className="absolute top-2 left-2 z-20">
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); toggleSelection(item.id, item.type, item); }}
                                                    className="w-6 h-6 rounded bg-white/40 backdrop-blur-sm flex items-center justify-center hover:bg-white/60 transition-colors"
                                                >
                                                    {isSelected
                                                        ? <MdCheckBox className="text-primary text-xl" />
                                                        : <MdCheckBoxOutlineBlank className="text-neutral-700 text-xl" />
                                                    }
                                                </div>
                                            </div>
                                        )}

                                        {!isSelectionMode && (
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                <CardPlayButton onClick={() => handleItemClick(item)} className="bottom-3 left-3" />
                                                <SmartMusicContextMenu
                                                    className="absolute bottom-3 right-3"
                                                    buttonClassName="w-10 h-10"
                                                    items={item}
                                                    context="recent"
                                                    onPlay={() => handleItemClick(item)}
                                                    isSelected={isSelected}
                                                    onSelect={() => isSelectionMode
                                                        ? toggleSelection(item.id, item.type, item)
                                                        : toggleSelectionMode({ id: item.id, type: item.type, data: item })
                                                    }
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-0.5 px-1">
                                        <span className={clsx(
                                            "truncate text-base font-semibold",
                                            isSelected ? "text-primary" : "text-neutral-900 dark:text-neutral-50"
                                        )} title={item.title}>
                                            {item.title}
                                        </span>
                                        <span className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={item.description}>
                                            {item.description}
                                            {/* 如果是非视频且有专辑信息才显示专辑 */}
                                            {!isVideoFile(item.path) && item.album && ` — ${item.album}`}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {contextMenu && (
                    <SmartCursorContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        item={contextMenu.item}
                        context="recent"
                        onClose={() => setContextMenu(null)}
                        isSelected={selectedIds.has(contextMenu.item.id)}
                        onSelect={() => {
                            const { id, type } = contextMenu.item;
                            if (isSelectionMode) {
                                toggleSelection(id, type, contextMenu.item);
                            } else {
                                toggleSelectionMode({ id, type, data: contextMenu.item });
                            }
                            setContextMenu(null);
                        }}
                    />
                )}
            </section>
        </PageContainer>
    );
}
