import { useNavigationStore } from '@/store/useNavigationStore';

interface QueueContext {
    type?: string;
    id?: string;
    name?: string;
}

export function navigateFromQueueContext(queueContext?: QueueContext | null, onNavigate?: () => void) {
    if (!queueContext || !onNavigate) return;

    const navigationStore = useNavigationStore.getState();
    const { type, id, name } = queueContext;

    if (id === 'favorites' || id === 'playlist:favorites') {
        navigationStore.openPlaylistDetail({ id: 'favorites', name: '喜爱歌曲' });
        onNavigate();
        return;
    }

    if (type === 'playlist' || type === 'playlist_detail') {
        const pid = parseInt(id || '0');
        if (pid) {
            navigationStore.openPlaylistDetail({ id: pid, name: name || '播放列表' });
            onNavigate();
        }
        return;
    }

    if (type === 'artist' || type === 'artist_detail') {
        navigationStore.push({ type: 'artist_detail', data: { name, count: 0, albumCount: 0, songs: [], cover: null } });
        onNavigate();
        return;
    }

    if (type === 'album' || type === 'album_detail') {
        navigationStore.push({ type: 'album_detail', data: { name, artist: undefined, songs: [], cover: null, count: 0 } });
        onNavigate();
        return;
    }

    if (type === 'library') {
        navigationStore.navigate('library');
        onNavigate();
    }
}
