import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

import type { RecentItem, SongMetadata } from '@/types';
import { fileService } from '@/services/fileService';
import { libraryService } from '@/services/libraryService';
import { audioService } from '@/services/audioService';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { sortSongs } from '@/utils/songSort';
import { formatTime } from '@/utils/time';

const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'm4v', '3gp', 'ts', 'rmvb', 'wmv', 'asf', 'ogv'];

export function useRecentPlayback() {
    const { playSong, playList } = usePlaybackActions();
    const { isSelectionMode, toggleSelection } = useSelectionStore();

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: RecentItem } | null>(null);
    const [pendingFolderPlay, setPendingFolderPlay] = useState<{
        folderPath: string;
        folderName: string;
        audioSongs: SongMetadata[];
        videoSongs: SongMetadata[];
    } | null>(null);

    const isVideoFile = (path: string): boolean => {
        const ext = path.split('.').pop()?.toLowerCase() || '';
        return VIDEO_EXTENSIONS.includes(ext);
    };

    const playVideoFile = async (path: string, meta: SongMetadata) => {
        const queue: SongMetadata[] = [{
            ...meta,
            path: path
        }];

        const { setVideoQueue, setVideoMetadata, setVideoMode, setIsPlaying } = usePlayerStore.getState();

        setVideoQueue(queue, 0);
        setVideoMetadata(queue[0]);
        setVideoMode(true);

        if (usePlayerStore.getState().isPlaying) {
            await audioService.pause();
            setIsPlaying(false);
        }
    };

    const buildRecentForFile = (path: string, meta: SongMetadata, isLibraryItem: boolean, existing?: RecentItem): RecentItem => {
        const isVideo = isVideoFile(path);

        if (existing) {
            return {
                ...existing,
                path: existing.path || path,
                cover_path: existing.cover_path || meta.cover_path || null,
                cover: null,
                lastPlayed: Date.now(),
                description: (existing.description === "Unknown Artist" || !existing.description)
                    ? (isVideo ? formatTime(meta.duration) : meta.artist)
                    : existing.description
            };
        }
        return {
            id: path,
            type: 'file',
            title: meta.title,
            description: isVideo ? formatTime(meta.duration) : meta.artist,
            cover: null,
            cover_path: meta.cover_path || null,
            path,
            lastPlayed: Date.now(),
            artist: isVideo ? "" : meta.artist,
            album: isVideo ? "" : meta.album,
            isLibraryItem
        };
    };

    const playSingleFile = async (path: string, isLibraryItem = false, existingRecent?: RecentItem) => {
        try {
            let meta: SongMetadata | null = null;
            try { meta = await fileService.getMetadata(path); } catch { }

            const safeMeta = meta || {
                title: path.split(/[\\/]/).pop() || 'Unknown',
                artist: 'Unknown Artist', album: 'Unknown Album', duration: 0, cover: null, cover_path: null, path: path
            };

            if (isVideoFile(path)) {
                const recentItem = buildRecentForFile(path, safeMeta, isLibraryItem, existingRecent);
                useLibraryStore.getState().addToRecent(recentItem);
                await playVideoFile(path, safeMeta);
            } else {
                await playSong({
                    song: safeMeta,
                    index: 0,
                    playlist: [safeMeta],
                    options: {
                        restartIfCurrent: true,
                        recentItem: buildRecentForFile(path, safeMeta, isLibraryItem, existingRecent)
                    },
                    context: {
                        type: 'home',
                        name: '主页',
                        id: 'home'
                    }
                });
            }
        } catch (err) { console.error("Play single file failed", err); }
    };

    const buildFolderRecentItem = (
        folderPath: string,
        folderName: string,
        items: SongMetadata[],
        label: string,
    ): RecentItem => ({
        id: folderPath,
        type: 'folder',
        title: folderName,
        description: `${items.length} ${label}`,
        cover: null,
        cover_path: items[0]?.cover_path || null,
        path: folderPath,
        lastPlayed: Date.now(),
    });

    const playVideoList = async (videos: SongMetadata[], recentItem: RecentItem) => {
        if (videos.length === 0) return;
        const { setVideoQueue, setVideoMetadata, setVideoMode, setIsPlaying } = usePlayerStore.getState();
        setVideoQueue(videos, 0);
        setVideoMetadata(videos[0]);
        setVideoMode(true);
        if (usePlayerStore.getState().isPlaying) {
            await audioService.pause();
            setIsPlaying(false);
        }
        useLibraryStore.getState().addToRecent(recentItem);
    };

    const playAudioList = async (songs: SongMetadata[], recentItem: RecentItem) => {
        if (songs.length === 0) return;
        await playList({
            songs,
            startIndex: 0,
            options: {
                restartIfCurrent: true,
                recentItem,
            },
            context: {
                type: 'home',
                name: '主页',
                id: 'home',
            }
        });
    };

    const playFolderItems = async (folderPath: string, songs: SongMetadata[], folderName: string) => {
        const audioSongs = songs.filter(s => s.path && !isVideoFile(s.path));
        const videoSongs = songs.filter(s => s.path && isVideoFile(s.path));

        if (audioSongs.length > 0 && videoSongs.length > 0) {
            setPendingFolderPlay({
                folderPath,
                folderName,
                audioSongs,
                videoSongs,
            });
            return;
        }

        if (videoSongs.length > 0) {
            const recentItem = buildFolderRecentItem(folderPath, folderName, videoSongs, "个视频");
            await playVideoList(videoSongs, recentItem);
            return;
        }

        if (audioSongs.length > 0) {
            const recentItem = buildFolderRecentItem(folderPath, folderName, audioSongs, "首歌曲");
            await playAudioList(audioSongs, recentItem);
        }
    };

    const handleItemClick = async (item: RecentItem, e?: React.MouseEvent) => {
        const id = item.id;

        if (isSelectionMode) {
            e?.stopPropagation();
            toggleSelection(id, item.type, item);
            return;
        }

        const playListHelper = async (songs: SongMetadata[]) => {
            if (songs.length === 0) return;
            const firstSong = songs[0];
            if (!firstSong.path) return;

            if (isVideoFile(firstSong.path)) {
                const { setVideoQueue, setVideoMetadata, setVideoMode, setIsPlaying } = usePlayerStore.getState();

                setVideoQueue(songs, 0);
                setVideoMetadata(songs[0]);
                setVideoMode(true);

                if (usePlayerStore.getState().isPlaying) {
                    await audioService.pause();
                    setIsPlaying(false);
                }

                useLibraryStore.getState().addToRecent({ ...item, lastPlayed: Date.now() });
            } else {
                await playList({
                    songs,
                    startIndex: 0,
                    options: {
                        restartIfCurrent: true,
                        recentItem: { ...item, lastPlayed: Date.now() }
                    },
                    context: {
                        type: 'home',
                        name: '主页',
                        id: 'home'
                    }
                });
            }
        };

        if (item.type === 'folder') {
            try {
                const songs = await fileService.readFolder(item.path);
                const folderName = item.title || item.path.split(/[\\/]/).pop() || "Unknown Folder";
                await playFolderItems(item.path, songs, folderName);
            } catch (e) {
                console.error("Failed to play folder", e);
            }
        } else if (item.type === 'album') {
            try {
                const allSongs = await libraryService.scanLibrary();
                const albumSongs = allSongs.filter(s =>
                    s.album === item.title &&
                    (item.artist ? s.artist === item.artist : true)
                );
                await playListHelper(albumSongs);
            } catch (err) {
                console.error("Failed to play recent album", err);
            }
        } else if (item.type === 'playlist') {
            try {
                const plIdStr = item.id.replace('playlist:', '');
                let songs: SongMetadata[] = [];

                if (plIdStr === 'favorites') {
                    songs = await libraryService.getFavorites();
                } else {
                    const plId = parseInt(plIdStr);
                    if (!isNaN(plId)) {
                        const rawSongs = await libraryService.getPlaylistSongs(plId);
                        const { getPlaylistSettings } = useLibraryStore.getState();
                        const settings = getPlaylistSettings(plIdStr);
                        songs = sortSongs(rawSongs, settings.sortKey, settings.sortOrder);
                    }
                }
                await playListHelper(songs);
            } catch (err) {
                console.error("Failed to play recent playlist", err);
            }
        } else if (item.type === 'video') {
            try {
                const meta: SongMetadata = {
                    id: -1,
                    title: item.title,
                    artist: item.artist || 'Unknown',
                    album: item.album || 'Unknown',
                    duration: 0,
                    path: item.path,
                    cover_path: item.cover_path,
                };
                await playVideoFile(item.path, meta);
            } catch (e) {
                console.error("Failed to play recent video", e);
            }
        } else {
            playSingleFile(item.path, item.isLibraryItem, item);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, item: RecentItem) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, item });
    };

    const handleOpenFolder = async () => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
                const songs = await fileService.readFolder(selected);
                if (songs.length === 0) return;
                const folderName = selected.split(/[\\/]/).pop() || "Unknown Folder";
                await playFolderItems(selected, songs, folderName);
            }
        } catch (err) {
            console.error('Failed to open folder:', err);
        }
    };

    const handleOpenFile = async () => {
        const selected = await open({
            multiple: false,
            filters: [
                { name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a'] },
                { name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv'] }
            ]
        });
        if (selected && typeof selected === 'string') {
            playSingleFile(selected);
        }
    };

    return {
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
    };
}
