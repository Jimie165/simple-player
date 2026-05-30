import type { ApplePlayerControlsSectionProps } from '@/features/player/apple/controls/ApplePlayerControlTypes';

export function useApplePlayerNavigation({
    metadata,
    onClose,
    push,
}: Pick<ApplePlayerControlsSectionProps, 'metadata' | 'onClose' | 'push'>) {
    const canNavigate = !!metadata && typeof metadata.id === 'number';

    const handleOpenArtist = () => {
        if (!metadata?.artist || !canNavigate) return;
        push({ type: 'artist_detail', data: { name: metadata.artist, count: 0, albumCount: 0, songs: [], cover: null } });
        window.setTimeout(() => onClose(), 0);
    };

    const handleOpenAlbum = () => {
        if (!metadata?.album || !canNavigate) return;
        push({ type: 'album_detail', data: { name: metadata.album, artist: metadata.artist, songs: [], cover: metadata.cover_path || null, count: 0 } });
        window.setTimeout(() => onClose(), 0);
    };

    return { canNavigate, handleOpenArtist, handleOpenAlbum };
}
