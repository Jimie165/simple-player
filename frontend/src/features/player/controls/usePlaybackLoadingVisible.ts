import { useEffect, useState } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';

export function usePlaybackLoadingVisible() {
    const pending = usePlayerStore(state => (state.audioLoadingCount > 0) && state.isPlaying && !!state.metadata?.path);
    const path = usePlayerStore(state => state.metadata?.path);
    const [state, setState] = useState({ pending, path, visible: false });
    if (state.pending !== pending || state.path !== path) {
        setState({ pending, path, visible: false });
    }

    useEffect(() => {
        if (!pending || !path) return;
        const timer = setTimeout(() => setState({ pending, path, visible: true }), 500);
        return () => clearTimeout(timer);
    }, [pending, path]);

    return pending && state.pending === pending && state.path === path && state.visible;
}
