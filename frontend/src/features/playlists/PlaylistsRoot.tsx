import { useEffect } from 'react';
import { useNavigationStore } from '../../store/useNavigationStore';
import PlaylistList from './PlaylistList';
import PlaylistDetail from './components/PlaylistDetail';

export default function PlaylistsRoot() {
    const { currentView, replace } = useNavigationStore();

    useEffect(() => {
        // Initialize if not in playlist context
        if (currentView.type !== 'playlist_list' && currentView.type !== 'playlist_detail') {
            replace({ type: 'playlist_list' });
        }
    }, []);

    if (currentView.type === 'playlist_detail') {
        // data should be { id: number | 'favorites', name: string }
        const data = currentView.data as { id: number | 'favorites', name: string };
        return <PlaylistDetail id={data.id} name={data.name} />;
    }

    return <PlaylistList />;
}
