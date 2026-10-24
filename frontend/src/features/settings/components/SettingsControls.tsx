import { useId, type ReactNode } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { MdCheck, MdUnfoldMore } from 'react-icons/md';
import clsx from 'clsx';

/** macOS 分组表单：标题 + 圆角分组 + 可选脚注。 */
export function SettingsGroup({
    title,
    footer,
    children,
}: {
    title?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="space-y-1.5">
            {title && <h3 className="px-3.5 text-[13px] font-semibold text-on-surface">{title}</h3>}
            <div className="settings-group overflow-hidden rounded-xl">{children}</div>
            {footer && <p className="px-3.5 pt-0.5 text-xs leading-relaxed text-on-surface-variant">{footer}</p>}
        </section>
    );
}

/** 左侧标签、右侧控件的标准设置行。 */
export function SettingsRow({
    label,
    description,
    children,
    className,
}: {
    label: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <div className={clsx('flex min-h-11 items-center justify-between gap-4 px-3.5 py-2.5', className)}>
            <div className="min-w-0 flex-1">
                <div className="text-sm text-on-surface">{label}</div>
                {description && <div className="mt-0.5 text-xs leading-snug text-on-surface-variant">{description}</div>}
            </div>
            {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
        </div>
    );
}

export function SettingsSwitch({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-label={label}
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={clsx(
                'inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                checked ? 'bg-primary' : 'bg-on-surface/15'
            )}
        >
            <span
                className={clsx(
                    'h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-out',
                    checked ? 'translate-x-4' : 'translate-x-0'
                )}
            />
        </button>
    );
}

export function SettingsSegmented<T extends string>({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string }[];
}) {
    const indicatorId = useId();

    return (
        <div role="radiogroup" aria-label={label} className="settings-subtle inline-flex rounded-lg p-0.5">
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(option.value)}
                        className={clsx(
                            'relative min-w-16 rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
                            selected ? 'text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
                        )}
                    >
                        {selected && (
                            <motion.span
                                layoutId={indicatorId}
                                className="settings-control settings-segment-indicator absolute inset-0 rounded-md"
                                transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
                            />
                        )}
                        <span className="relative">{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** macOS 弹出式按钮（Pop-up Button）。 */
export function SettingsPopup<T extends string>({
    label,
    value,
    onChange,
    options,
    buttonLabel,
    menuClassName = 'z-50',
}: {
    label: string;
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string; description?: string }[];
    buttonLabel?: string;
    menuClassName?: string;
}) {
    const selectedLabel = buttonLabel ?? options.find((option) => option.value === value)?.label;

    return (
        <Listbox value={value} onChange={onChange}>
            {({ open }) => (
                <>
                    <ListboxButton
                        aria-label={label}
                        className="settings-control flex max-w-64 items-center gap-1.5 rounded-md py-1 pl-2.5 pr-1.5 text-[13px] text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                        <span className="truncate">{selectedLabel}</span>
                        <MdUnfoldMore className="shrink-0 text-base text-on-surface-variant" />
                    </ListboxButton>
                    <AnimatePresence>
                        {open && (
                            <ListboxOptions
                                static
                                anchor="bottom end"
                                as={motion.div}
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0, transition: { duration: 0.14, ease: 'easeOut' } }}
                                exit={{ opacity: 0, transition: { duration: 0.1, ease: 'easeIn' } }}
                                className={clsx('settings-menu max-h-72 min-w-(--button-width) overflow-y-auto rounded-xl p-1 [--anchor-gap:6px] focus:outline-none', menuClassName)}
                            >
                                {options.map((option) => (
                                    <ListboxOption
                                        key={option.value}
                                        value={option.value}
                                        className="group flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 text-[13px] text-on-surface data-focus:bg-primary data-focus:text-on-primary"
                                    >
                                        <MdCheck className={clsx('mt-0.5 shrink-0 text-sm', option.value === value ? 'opacity-100' : 'opacity-0')} />
                                        <span className="min-w-0">
                                            <span className="block">{option.label}</span>
                                            {option.description && (
                                                <span className="block text-[11px] text-on-surface-variant group-data-focus:text-on-primary/80">
                                                    {option.description}
                                                </span>
                                            )}
                                        </span>
                                    </ListboxOption>
                                ))}
                            </ListboxOptions>
                        )}
                    </AnimatePresence>
                </>
            )}
        </Listbox>
    );
}

