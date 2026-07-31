import type { AlbumData } from '@/features/library/components/AlbumGridView';
import {
    canRestoreAlbumField,
    type AlbumEditFieldKey,
    type AlbumEditFields,
    type AlbumEditFormErrors,
    type AlbumOriginalMetadata,
} from '@/features/library/dialogs/album-edit/albumEditForm';
import {
    MetadataEditField,
    MetadataEditFieldPair,
    MetadataEditFieldSeparator,
} from '@/features/library/dialogs/metadata-edit/MetadataEditField';

interface AlbumInfoFieldsProps {
    album: AlbumData;
    fields: AlbumEditFields;
    originals: AlbumOriginalMetadata | null;
    errors: AlbumEditFormErrors;
    onChange: (field: AlbumEditFieldKey, value: string) => void;
    onRestore: (field: AlbumEditFieldKey) => void;
}

export default function AlbumInfoFields({
    album,
    fields,
    originals,
    errors,
    onChange,
    onRestore,
}: AlbumInfoFieldsProps) {
    const fieldProps = (key: AlbumEditFieldKey) => ({
        value: fields[key].value,
        mixed: fields[key].mixed,
        onChange: (value: string) => onChange(key, value),
        canRestore: canRestoreAlbumField(album, originals, fields, key),
        onRestore: () => onRestore(key),
    });

    return (
        <div className="space-y-0">
            <MetadataEditField label="专辑" {...fieldProps('album')} />
            <MetadataEditField label="艺人" {...fieldProps('artist')} />
            <MetadataEditField label="专辑艺人" {...fieldProps('albumArtist')} />
            <MetadataEditField label="流派" {...fieldProps('genre')} />
            <MetadataEditField label="年份" {...fieldProps('year')} error={errors.year} inputMode="numeric" />
            <MetadataEditFieldPair>
                <MetadataEditField compact label="音轨" {...fieldProps('trackNumber')} error={errors.trackNumber} inputMode="numeric" />
                <MetadataEditFieldSeparator />
                <MetadataEditField compact label="总音轨" {...fieldProps('trackTotal')} error={errors.trackTotal} inputMode="numeric" />
            </MetadataEditFieldPair>
            <MetadataEditFieldPair>
                <MetadataEditField compact label="光盘" {...fieldProps('discNumber')} error={errors.discNumber} inputMode="numeric" />
                <MetadataEditFieldSeparator />
                <MetadataEditField compact label="总光盘" {...fieldProps('discTotal')} error={errors.discTotal} inputMode="numeric" />
            </MetadataEditFieldPair>
        </div>
    );
}
