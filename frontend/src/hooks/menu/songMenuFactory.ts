import {
    MdPlayArrow,
    MdShuffle,
    MdFavorite,
    MdFavoriteBorder,
    MdDelete,
    MdInfo,
    MdEdit,
    MdCheckBoxOutlineBlank,
    MdCheckBox,
    MdAlbum,
    MdPerson,
    MdPlaylistPlay,
    MdPlaylistRemove,
    MdPlaylistAdd,
    MdRemoveCircleOutline,
} from 'react-icons/md';
import { getMusicItemType } from '@/utils/musicItemUtils';
import type { MusicItem } from '@/utils/musicItemUtils';

interface MenuItemDataLike {
    id: string;
    label: string;
    icon: any;
    onClick: () => void;
    variant?: 'default' | 'danger';
}

interface BuildSongMenuGroupsParams {
    items: MusicItem[];
    context: string;
    count: number;
    isSingle: boolean;
    firstItem?: MusicItem;
    hideSelect: boolean;
    selectText: string;
    isSelected: boolean;
    onSelect?: () => void;
    onEdit?: () => void;
    onShowProperties?: () => void;
    canAddToPlaylist: boolean;
    isAllFavorited: boolean;
    handlePlay: () => void;
    handleShufflePlay: () => void;
    handleAddToQueue: () => void;
    handleAddToPlaylist: () => void;
    handleFavorite: () => void;
    handleProperties: () => void;
    handleShowAlbum: () => void;
    handleShowArtist: () => void;
    handleDeleteOrRemove: () => void;
    handleDeleteFromLibrary: () => void;
}

export function buildSongMenuGroups({
    items,
    context,
    count,
    isSingle,
    firstItem,
    hideSelect,
    selectText,
    isSelected,
    onSelect,
    onEdit,
    onShowProperties,
    canAddToPlaylist,
    isAllFavorited,
    handlePlay,
    handleShufflePlay,
    handleAddToQueue,
    handleAddToPlaylist,
    handleFavorite,
    handleProperties,
    handleShowAlbum,
    handleShowArtist,
    handleDeleteOrRemove,
    handleDeleteFromLibrary,
}: BuildSongMenuGroupsParams): MenuItemDataLike[][] {
    const groups: MenuItemDataLike[][] = [];

    const group1: MenuItemDataLike[] = [];
    group1.push({ id: 'play', label: '播放', icon: MdPlayArrow, onClick: handlePlay });
    const firstType = firstItem ? getMusicItemType(firstItem) : 'song';
    const allowShuffle = !isSingle || ['playlist', 'album', 'artist', 'folder'].includes(firstType);
    if (allowShuffle) {
        group1.push({ id: 'shuffle', label: '随机播放', icon: MdShuffle, onClick: handleShufflePlay });
    }
    group1.push({ id: 'queue', label: '加入播放队列', icon: MdPlaylistPlay, onClick: handleAddToQueue });

    if (context !== 'folder' && canAddToPlaylist) {
        group1.push({ id: 'add-to', label: '添加到播放列表...', icon: MdPlaylistAdd, onClick: handleAddToPlaylist });
    }

    const canFavorite = items.length > 0 && items.every(i => {
        const t = getMusicItemType(i);
        return t === 'song' || t === 'file';
    });

    if (canFavorite && canAddToPlaylist) {
        const isFav = isAllFavorited;
        group1.push({
            id: 'favorite',
            label: isFav ? '取消喜爱' : '喜爱',
            icon: isFav ? MdFavorite : MdFavoriteBorder,
            onClick: handleFavorite,
        });
    }
    groups.push(group1);

    const group2: MenuItemDataLike[] = [];
    if (isSingle) {
        const type = firstType;
        const item: any = firstItem;

        let showProperties = true;
        if (context === 'folder' && type === 'folder') showProperties = false;

        const allowPropertiesType = ['song', 'file', 'video'].includes(type) || !!onShowProperties;

        if (showProperties && allowPropertiesType && type !== 'playlist') {
            group2.push({ id: 'properties', label: '属性', icon: MdInfo, onClick: handleProperties });
        }

        const showAlbum = context !== 'album_detail';
        const showArtist = context !== 'artist_detail';

        const albumValue = item?.album || (type === 'album' ? (item?.name || item?.title) : undefined);
        const artistValue = item?.artist || (type === 'artist' ? item?.name : undefined) || (type === 'album' ? item?.artist : undefined);

        const isSongFile = type === 'song' || type === 'file';

        if (showAlbum && (albumValue || isSongFile)) {
            if (typeof item?.id === 'number' || item?.isLibraryItem === true || type === 'album' || type === 'artist') {
                group2.push({ id: 'album', label: '前往专辑', icon: MdAlbum, onClick: handleShowAlbum });
            }
        }
        if (showArtist && (artistValue || isSongFile)) {
            if (typeof item?.id === 'number' || item?.isLibraryItem === true || type === 'album' || type === 'artist') {
                group2.push({ id: 'artist', label: '前往艺人', icon: MdPerson, onClick: handleShowArtist });
            }
        }
    }

    if (onEdit) {
        group2.push({ id: 'edit', label: '编辑信息', icon: MdEdit, onClick: onEdit });
    }

    if (group2.length > 0) groups.push(group2);

    const group3: MenuItemDataLike[] = [];
    if (context === 'playlist') {
        const label = count > 1 ? `从播放列表移除 ${count} 项` : '从播放列表移除';
        group3.push({ id: 'remove', label, icon: MdPlaylistRemove, onClick: handleDeleteOrRemove, variant: 'default' });

        const deleteLabel = count > 1 ? `从音乐库删除 ${count} 项` : '从音乐库删除';
        group3.push({ id: 'delete', label: deleteLabel, icon: MdDelete, onClick: handleDeleteFromLibrary, variant: 'danger' });
    } else if (context === 'queue') {
        const label = count > 1 ? `从播放队列移除 ${count} 项` : '从播放队列移除';
        group3.push({ id: 'remove_queue', label, icon: MdRemoveCircleOutline, onClick: handleDeleteOrRemove, variant: 'default' });
    } else {
        const suffix = context === 'video' ? '视频库' : '音乐库';
        let label = count > 1 ? `从${suffix}删除 ${count} 项` : `从${suffix}删除`;
        if (context === 'recent') {
            label = count > 1 ? `删除 ${count} 条记录` : '删除记录';
        } else if (context === 'playlist_list') {
            label = count > 1 ? `删除 ${count} 个播放列表` : '删除播放列表';
        }

        group3.push({ id: 'delete', label, icon: MdDelete, onClick: handleDeleteOrRemove, variant: 'danger' });
    }
    if (group3.length > 0) groups.push(group3);

    if (!hideSelect && onSelect) {
        const label = isSelected ? '取消选择' : selectText;
        const icon = isSelected ? MdCheckBox : MdCheckBoxOutlineBlank;
        groups.push([{ id: 'select', label, icon, onClick: onSelect }]);
    }

    return groups;
}
