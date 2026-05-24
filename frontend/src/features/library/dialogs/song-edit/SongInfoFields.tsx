import type React from 'react';
import type { SongEditFormErrors, SongEditFormValues } from '@/features/library/dialogs/song-edit/songEditForm';

interface SongInfoFieldsProps {
    values: SongEditFormValues;
    errors: SongEditFormErrors;
    onChange: (patch: Partial<SongEditFormValues>) => void;
}

const textInputClass = "w-full bg-transparent px-0 pb-2 text-[15px] text-neutral-950 outline-none dark:text-neutral-50";

function Field({
    label,
    value,
    onChange,
    error,
    placeholder,
    inputMode,
    compact = false,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    placeholder?: string;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    compact?: boolean;
}) {
    return (
        <label className={compact ? "block" : "block border-b border-neutral-200/80 py-3 dark:border-white/10"}>
            <span className="mb-1 block text-[13px] text-neutral-500 dark:text-neutral-400">{label}</span>
            <div className="flex items-baseline gap-2">
                <input
                    aria-label={label}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    inputMode={inputMode}
                    className={textInputClass}
                />
            </div>
            {error && <span className="text-xs text-red-500">{error}</span>}
        </label>
    );
}

export default function SongInfoFields({ values, errors, onChange }: SongInfoFieldsProps) {
    return (
        <div className="space-y-0">
            <Field
                label="标题"
                value={values.title}
                onChange={(title) => onChange({ title })}
                error={errors.title}
            />
            <Field label="专辑" value={values.album} onChange={(album) => onChange({ album })} />
            <Field label="艺人" value={values.artist} onChange={(artist) => onChange({ artist })} />
            <Field label="专辑艺人" value={values.albumArtist} onChange={(albumArtist) => onChange({ albumArtist })} />
            <Field label="流派" value={values.genre} onChange={(genre) => onChange({ genre })} />
            <Field label="年份" value={values.year} onChange={(year) => onChange({ year })} error={errors.year} inputMode="numeric" />
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-b border-neutral-200/80 py-3 dark:border-white/10">
                <Field compact label="音轨" value={values.trackNumber} onChange={(trackNumber) => onChange({ trackNumber })} error={errors.trackNumber} inputMode="numeric" />
                <span className="pb-2 text-[15px] text-neutral-500 dark:text-neutral-400">/</span>
                <Field compact label="总音轨" value={values.trackTotal} onChange={(trackTotal) => onChange({ trackTotal })} error={errors.trackTotal} inputMode="numeric" />
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-b border-neutral-200/80 py-3 dark:border-white/10">
                <Field compact label="光盘" value={values.discNumber} onChange={(discNumber) => onChange({ discNumber })} error={errors.discNumber} inputMode="numeric" />
                <span className="pb-2 text-[15px] text-neutral-500 dark:text-neutral-400">/</span>
                <Field compact label="总光盘" value={values.discTotal} onChange={(discTotal) => onChange({ discTotal })} error={errors.discTotal} inputMode="numeric" />
            </div>
        </div>
    );
}
