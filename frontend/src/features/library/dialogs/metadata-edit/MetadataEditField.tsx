import type React from 'react';
import { MdUndo } from 'react-icons/md';
import clsx from 'clsx';
import CustomTooltip from '@/components/common/CustomTooltip';

const textInputClass = 'w-full bg-transparent px-0 pb-2 text-[15px] text-neutral-950 outline-none placeholder:text-neutral-400 dark:text-neutral-50 dark:placeholder:text-neutral-500';

interface MetadataEditFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    onRestore?: () => void;
    canRestore?: boolean;
    error?: string;
    placeholder?: string;
    mixed?: boolean;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    compact?: boolean;
}

export function MetadataEditField({
    label,
    value,
    onChange,
    onRestore,
    canRestore = false,
    error,
    placeholder,
    mixed = false,
    inputMode,
    compact = false,
}: MetadataEditFieldProps) {
    return (
        <label className={compact ? 'block' : 'block border-b border-neutral-200/80 py-3 dark:border-white/10'}>
            <span className="mb-1 block text-[13px] text-neutral-500 dark:text-neutral-400">{label}</span>
            <div className="relative">
                <input
                    aria-label={label}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (mixed && (event.key === 'Backspace' || event.key === 'Delete')) {
                            onChange('');
                        }
                    }}
                    placeholder={mixed ? '混合' : placeholder}
                    inputMode={inputMode}
                    className={clsx(textInputClass, canRestore && 'pr-12')}
                />
                {canRestore && onRestore && (
                    <CustomTooltip text={`恢复${label}`} className="absolute right-0 top-1/2 -translate-y-[calc(50%+0.25rem)]">
                        <button
                            type="button"
                            aria-label={`恢复${label}`}
                            onClick={onRestore}
                            className="grid h-8 w-10 place-items-center rounded-md border border-neutral-300 bg-white text-neutral-700 shadow-sm transition-colors hover:border-primary hover:text-primary active:scale-95 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-primary dark:hover:text-primary"
                        >
                            <MdUndo className="text-xl" />
                        </button>
                    </CustomTooltip>
                )}
            </div>
            {error && <span className="text-xs text-red-500">{error}</span>}
        </label>
    );
}

export function MetadataEditFieldPair({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-b border-neutral-200/80 py-3 dark:border-white/10">
            {children}
        </div>
    );
}

export function MetadataEditFieldSeparator() {
    return <span className="pb-2 text-[15px] text-neutral-500 dark:text-neutral-400">/</span>;
}
