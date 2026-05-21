import type { MusicItem } from '@/utils/musicItemUtils';
import { getMusicItemType } from '@/utils/musicItemUtils';
import type { MenuItemData, MusicMenuContext } from '@/hooks/menu/useSongOperations';

const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'm4v', '3gp', 'ts', 'rmvb', 'wmv', 'asf', 'ogv'];

function getRecord(item: MusicItem): Record<string, unknown> {
    return item as unknown as Record<string, unknown>;
}

export function filterMenuGroupsByContext(
    groups: MenuItemData[][],
    context: MusicMenuContext,
    items: MusicItem[]
): MenuItemData[][] {
    if (context === 'video') {
        const allowedIds = ['play', 'properties', 'delete', 'select'];
        return groups.map(group => group.filter(item => allowedIds.includes(item.id))).filter(group => group.length > 0);
    }

    if (context === 'recent') {
        const isVideoItem = (item: MusicItem) => {
            const type = getMusicItemType(item);
            if (type === 'video') return true;
            const path = getRecord(item).path;
            if (type === 'file' && typeof path === 'string') {
                const ext = path.split('.').pop()?.toLowerCase() || '';
                return VIDEO_EXTENSIONS.includes(ext);
            }
            return false;
        };

        const hasVideo = items.some(isVideoItem);

        if (hasVideo) {
            const allVideos = items.every(isVideoItem);
            const allowedIds = allVideos ? ['play', 'properties', 'delete', 'select'] : ['delete', 'select'];
            return groups.map(group => group.filter(item => allowedIds.includes(item.id))).filter(group => group.length > 0);
        }
    }

    if (context === 'playlist_list' && items.some(item => {
        const id = getRecord(item).id;
        return id === 'favorites' || id === 'playlist:favorites';
    })) {
        return groups.filter(group => !group.some(menuItem => menuItem.id === 'delete'));
    }

    return groups;
}
