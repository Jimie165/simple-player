import type { SongEditFormErrors, SongEditFormValues } from '@/features/library/dialogs/song-edit/songEditForm';
import {
    MetadataEditField,
    MetadataEditFieldPair,
    MetadataEditFieldSeparator,
} from '@/features/library/dialogs/metadata-edit/MetadataEditField';

interface SongInfoFieldsProps {
    values: SongEditFormValues;
    originalValues?: SongEditFormValues | null;
    errors: SongEditFormErrors;
    onChange: (patch: Partial<SongEditFormValues>) => void;
}

const normalizeValue = (value?: string) => (value ?? '').trim();
type InfoFieldKey =
    | 'title'
    | 'artist'
    | 'album'
    | 'albumArtist'
    | 'year'
    | 'genre'
    | 'trackNumber'
    | 'trackTotal'
    | 'discNumber'
    | 'discTotal';

function canRestoreField(
    values: SongEditFormValues,
    originalValues: SongEditFormValues | null | undefined,
    field: InfoFieldKey
) {
    if (!originalValues) return false;
    return normalizeValue(values[field]) !== normalizeValue(originalValues[field]);
}

export default function SongInfoFields({ values, originalValues, errors, onChange }: SongInfoFieldsProps) {
    const restoreField = (field: InfoFieldKey) => {
        if (!originalValues) return;
        onChange({ [field]: originalValues[field] });
    };

    return (
        <div className="space-y-0">
            <MetadataEditField
                label="标题"
                value={values.title}
                onChange={(title) => onChange({ title })}
                canRestore={canRestoreField(values, originalValues, 'title')}
                onRestore={() => restoreField('title')}
                error={errors.title}
            />
            <MetadataEditField label="专辑" value={values.album} onChange={(album) => onChange({ album })} canRestore={canRestoreField(values, originalValues, 'album')} onRestore={() => restoreField('album')} />
            <MetadataEditField label="艺人" value={values.artist} onChange={(artist) => onChange({ artist })} canRestore={canRestoreField(values, originalValues, 'artist')} onRestore={() => restoreField('artist')} />
            <MetadataEditField label="专辑艺人" value={values.albumArtist} onChange={(albumArtist) => onChange({ albumArtist })} canRestore={canRestoreField(values, originalValues, 'albumArtist')} onRestore={() => restoreField('albumArtist')} />
            <MetadataEditField label="流派" value={values.genre} onChange={(genre) => onChange({ genre })} canRestore={canRestoreField(values, originalValues, 'genre')} onRestore={() => restoreField('genre')} />
            <MetadataEditField label="年份" value={values.year} onChange={(year) => onChange({ year })} canRestore={canRestoreField(values, originalValues, 'year')} onRestore={() => restoreField('year')} error={errors.year} inputMode="numeric" />
            <MetadataEditFieldPair>
                <MetadataEditField compact label="音轨" value={values.trackNumber} onChange={(trackNumber) => onChange({ trackNumber })} canRestore={canRestoreField(values, originalValues, 'trackNumber')} onRestore={() => restoreField('trackNumber')} error={errors.trackNumber} inputMode="numeric" />
                <MetadataEditFieldSeparator />
                <MetadataEditField compact label="总音轨" value={values.trackTotal} onChange={(trackTotal) => onChange({ trackTotal })} canRestore={canRestoreField(values, originalValues, 'trackTotal')} onRestore={() => restoreField('trackTotal')} error={errors.trackTotal} inputMode="numeric" />
            </MetadataEditFieldPair>
            <MetadataEditFieldPair>
                <MetadataEditField compact label="光盘" value={values.discNumber} onChange={(discNumber) => onChange({ discNumber })} canRestore={canRestoreField(values, originalValues, 'discNumber')} onRestore={() => restoreField('discNumber')} error={errors.discNumber} inputMode="numeric" />
                <MetadataEditFieldSeparator />
                <MetadataEditField compact label="总光盘" value={values.discTotal} onChange={(discTotal) => onChange({ discTotal })} canRestore={canRestoreField(values, originalValues, 'discTotal')} onRestore={() => restoreField('discTotal')} error={errors.discTotal} inputMode="numeric" />
            </MetadataEditFieldPair>
        </div>
    );
}
