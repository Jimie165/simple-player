import type { AlbumData } from '@/features/library/components/AlbumGridView';
import { getAlbumEditCoverPath } from '@/features/library/dialogs/album-edit/albumEditForm';
import ArtworkEditor from '@/features/library/dialogs/metadata-edit/ArtworkEditor';

interface AlbumArtworkFieldsProps {
    album: AlbumData;
    artworkSourcePath: string | null;
    removeArtwork: boolean;
    onChange: (patch: { artworkSourcePath: string | null; removeArtwork: boolean }) => void;
    onError: (message: string) => void;
}

export default function AlbumArtworkFields({
    album,
    artworkSourcePath,
    removeArtwork,
    onChange,
    onError,
}: AlbumArtworkFieldsProps) {
    const displayedCoverPath = getAlbumEditCoverPath(album, artworkSourcePath, removeArtwork);
    const hasCustomArtwork = Boolean(
        artworkSourcePath || (!removeArtwork && album.songs.some(song => song.artwork_path))
    );
    const hasMixedCovers = !artworkSourcePath
        && !removeArtwork
        && new Set(album.songs.map(song => song.cover_path ?? '')).size > 1;

    return (
        <ArtworkEditor
            song={album.songs[0]}
            coverPath={displayedCoverPath}
            hasCustomArtwork={hasCustomArtwork}
            hasMixedCovers={hasMixedCovers}
            removeMenuId="remove-album-artwork"
            onSelect={(path) => onChange({ artworkSourcePath: path, removeArtwork: false })}
            onRemove={() => onChange({
                artworkSourcePath: null,
                removeArtwork: album.songs.some(song => song.artwork_path),
            })}
            onError={onError}
        />
    );
}
