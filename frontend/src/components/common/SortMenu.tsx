import { useState } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { MdCheck, MdSort } from 'react-icons/md';
import clsx from 'clsx';
import CustomTooltip from '@/components/common/CustomTooltip';

interface SortMenuProps<T extends string> {
    value: T;
    options: readonly { value: T; label: string }[];
    onChange: (value: T) => void;
    order?: { value: 'asc' | 'desc'; onChange: (value: 'asc' | 'desc') => void };
    className?: string;
}

export default function SortMenu<T extends string>({ value, options, onChange, order, className }: SortMenuProps<T>) {
    const [suppressTooltip, setSuppressTooltip] = useState(false);
    const itemClassName = 'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-on-surface transition-colors data-focus:bg-on-surface/8 aria-pressed:bg-primary/10 base-theme:data-focus:bg-surface-variant/40 base-theme:aria-pressed:bg-secondary-container base-theme:aria-pressed:text-on-secondary-container';

    return (
        <Menu as="div" className={clsx('relative', className)}>
            {({ open }) => (
                <>
                    <CustomTooltip text="排序方式" placement="bottom" disabled={open} show={suppressTooltip ? false : undefined}>
                        <MenuButton
                            aria-label="排序方式"
                            onClick={() => setSuppressTooltip(true)}
                            onMouseLeave={() => setSuppressTooltip(false)}
                            className={clsx(
                                'flex h-10 w-10 items-center justify-center rounded-full border border-on-surface/10 backdrop-blur-md transition-[background-color,color,scale,box-shadow] duration-200 active:scale-95 motion-reduce:transition-none',
                                open
                                    ? 'bg-primary text-on-primary shadow-sm base-theme:bg-primary-container base-theme:text-on-primary-container'
                                    : 'bg-on-surface/5 text-on-surface-variant hover:bg-on-surface/10 hover:text-primary base-theme:bg-secondary-container/50 base-theme:text-on-secondary-container base-theme:hover:bg-secondary-container'
                            )}
                        >
                            <MdSort className={clsx('text-xl transition-[scale] duration-200 motion-reduce:transition-none', open && 'scale-110')} />
                        </MenuButton>
                    </CustomTooltip>
                    <MenuItems
                        transition
                        anchor="bottom end"
                        className="z-100 w-56 origin-top-right rounded-xl border border-outline-variant/50 bg-surface/95 p-1 text-on-surface shadow-xl backdrop-blur-xl [--anchor-gap:8px] transition-[opacity,scale,translate] duration-150 ease-out data-closed:-translate-y-1 data-closed:scale-95 data-closed:opacity-0 focus:outline-none motion-reduce:transition-none"
                    >
                        {options.map(option => (
                            <MenuItem key={option.value}>
                                <button type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={itemClassName}>
                                    {option.label}
                                    {value === option.value && <MdCheck className="shrink-0 text-lg" />}
                                </button>
                            </MenuItem>
                        ))}
                        {order && (
                            <>
                                <div className="my-1 border-t border-outline-variant/40" />
                                {(['asc', 'desc'] as const).map(direction => (
                                    <MenuItem key={direction}>
                                        <button type="button" aria-pressed={order.value === direction} onClick={() => order.onChange(direction)} className={itemClassName}>
                                            {direction === 'asc' ? '升序' : '降序'}
                                            {order.value === direction && <MdCheck className="shrink-0 text-lg" />}
                                        </button>
                                    </MenuItem>
                                ))}
                            </>
                        )}
                    </MenuItems>
                </>
            )}
        </Menu>
    );
}
