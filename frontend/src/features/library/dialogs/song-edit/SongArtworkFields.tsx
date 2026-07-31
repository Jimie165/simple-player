import ArtworkEditor from '@/features/library/dialogs/metadata-edit/ArtworkEditor';
import type { SongMetadata } from '@/types';

interface SongArtworkFieldsProps {
    song: SongMetadata;
    artworkSourcePath: string | null;
    removeArtwork: boolean;
    onChange: (patch: { artworkSourcePath: string | null; removeArtwork: boolean }) => void;
    onError: (message: string) => void;
}

export default function SongArtworkFields({
    song,
    artworkSourcePath,
    removeArtwork,
    onChange,
    onError,
}: SongArtworkFieldsProps) {
    const displayedCoverPath = artworkSourcePath
        ?? (removeArtwork ? song.embedded_cover_path : song.cover_path)
        ?? null;
    const hasCustomArtwork = Boolean(
        artworkSourcePath || (!removeArtwork && song.artwork_path)
    );

    return (
        <ArtworkEditor
            song={song}
            coverPath={displayedCoverPath}
            hasCustomArtwork={hasCustomArtwork}
            removeMenuId="remove-artwork"
            onSelect={(path) => onChange({ artworkSourcePath: path, removeArtwork: false })}
            onRemove={() => onChange({
                artworkSourcePath: null,
                removeArtwork: Boolean(song.artwork_path),
            })}
            onError={onError}
        />
    );
}
