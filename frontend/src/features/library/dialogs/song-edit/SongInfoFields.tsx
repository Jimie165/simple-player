import type React from 'react';
import { MdUndo } from 'react-icons/md';
import clsx from 'clsx';
import type { SongEditFormErrors, SongEditFormValues } from '@/features/library/dialogs/song-edit/songEditForm';

interface SongInfoFieldsProps {
    values: SongEditFormValues;
    originalValues?: SongEditFormValues | null;
    errors: SongEditFormErrors;
    onChange: (patch: Partial<SongEditFormValues>) => void;
}

const textInputClass = "w-full bg-transparent px-0 pb-2 text-[15px] text-neutral-950 outline-none dark:text-neutral-50";
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

function Field({
    label,
    value,
    onChange,
    onRestore,
    canRestore = false,
    error,
    placeholder,
    inputMode,
    compact = false,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    onRestore?: () => void;
    canRestore?: boolean;
    error?: string;
    placeholder?: string;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    compact?: boolean;
}) {
    return (
        <label className={compact ? "block" : "block border-b border-neutral-200/80 py-3 dark:border-white/10"}>
            <span className="mb-1 block text-[13px] text-neutral-500 dark:text-neutral-400">{label}</span>
            <div className="relative">
                <input
                    aria-label={label}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    inputMode={inputMode}
                    className={clsx(textInputClass, canRestore && "pr-12")}
                />
                {canRestore && onRestore && (
                    <button
                        type="button"
                        aria-label={`恢复${label}`}
                        title={`恢复${label}`}
                        onClick={onRestore}
                        className="absolute right-0 top-1/2 grid h-8 w-10 -translate-y-[calc(50%+0.25rem)] place-items-center rounded-[6px] border border-neutral-300 bg-white text-neutral-700 shadow-sm transition-colors hover:border-primary hover:text-primary active:scale-95 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-primary dark:hover:text-primary"
                    >
                        <MdUndo className="text-xl" />
                    </button>
                )}
            </div>
            {error && <span className="text-xs text-red-500">{error}</span>}
        </label>
    );
}

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
            <Field
                label="标题"
                value={values.title}
                onChange={(title) => onChange({ title })}
                canRestore={canRestoreField(values, originalValues, 'title')}
                onRestore={() => restoreField('title')}
                error={errors.title}
            />
            <Field label="专辑" value={values.album} onChange={(album) => onChange({ album })} canRestore={canRestoreField(values, originalValues, 'album')} onRestore={() => restoreField('album')} />
            <Field label="艺人" value={values.artist} onChange={(artist) => onChange({ artist })} canRestore={canRestoreField(values, originalValues, 'artist')} onRestore={() => restoreField('artist')} />
            <Field label="专辑艺人" value={values.albumArtist} onChange={(albumArtist) => onChange({ albumArtist })} canRestore={canRestoreField(values, originalValues, 'albumArtist')} onRestore={() => restoreField('albumArtist')} />
            <Field label="流派" value={values.genre} onChange={(genre) => onChange({ genre })} canRestore={canRestoreField(values, originalValues, 'genre')} onRestore={() => restoreField('genre')} />
            <Field label="年份" value={values.year} onChange={(year) => onChange({ year })} canRestore={canRestoreField(values, originalValues, 'year')} onRestore={() => restoreField('year')} error={errors.year} inputMode="numeric" />
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-b border-neutral-200/80 py-3 dark:border-white/10">
                <Field compact label="音轨" value={values.trackNumber} onChange={(trackNumber) => onChange({ trackNumber })} canRestore={canRestoreField(values, originalValues, 'trackNumber')} onRestore={() => restoreField('trackNumber')} error={errors.trackNumber} inputMode="numeric" />
                <span className="pb-2 text-[15px] text-neutral-500 dark:text-neutral-400">/</span>
                <Field compact label="总音轨" value={values.trackTotal} onChange={(trackTotal) => onChange({ trackTotal })} canRestore={canRestoreField(values, originalValues, 'trackTotal')} onRestore={() => restoreField('trackTotal')} error={errors.trackTotal} inputMode="numeric" />
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-b border-neutral-200/80 py-3 dark:border-white/10">
                <Field compact label="光盘" value={values.discNumber} onChange={(discNumber) => onChange({ discNumber })} canRestore={canRestoreField(values, originalValues, 'discNumber')} onRestore={() => restoreField('discNumber')} error={errors.discNumber} inputMode="numeric" />
                <span className="pb-2 text-[15px] text-neutral-500 dark:text-neutral-400">/</span>
                <Field compact label="总光盘" value={values.discTotal} onChange={(discTotal) => onChange({ discTotal })} canRestore={canRestoreField(values, originalValues, 'discTotal')} onRestore={() => restoreField('discTotal')} error={errors.discTotal} inputMode="numeric" />
            </div>
        </div>
    );
}
