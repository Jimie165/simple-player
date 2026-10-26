import { useRef, useState } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { MdCheck, MdSort } from 'react-icons/md';
import clsx from 'clsx';
import CustomTooltip from '@/components/common/CustomTooltip';
import MenuDismiss from '@/components/common/MenuDismiss';
import { useSelectionStore } from '@/store/useSelectionStore';

interface SortMenuProps<T extends string> {
    value: T;
    options: readonly { value: T; label: string }[];
    onChange: (value: T) => void;
    order?: { value: 'asc' | 'desc'; onChange: (value: 'asc' | 'desc') => void };
    className?: string;
}

export default function SortMenu<T extends string>({ value, options, onChange, order, className }: SortMenuProps<T>) {
    const disabled = useSelectionStore(state => state.isSelectionMode);
    const [suppressTooltip, setSuppressTooltip] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const itemClassName = 'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-on-surface transition-colors hover:bg-menu-hover data-focus:bg-menu-hover aria-pressed:bg-menu-highlight';

    return (
        <Menu key={disabled ? 'disabled' : 'enabled'} as="div" className={clsx('relative', disabled && 'opacity-40 pointer-events-none', className)}>
            {({ open, close }) => (
                <>
                    <MenuDismiss open={open} menuRef={menuRef} triggerRef={triggerRef} onClose={close} />
                    <CustomTooltip text="排序方式" placement="bottom" disabled={open || disabled} show={suppressTooltip ? false : undefined}>
                        <MenuButton
                            disabled={disabled}
                            ref={triggerRef}
                            aria-label="排序方式"
                            onClick={() => setSuppressTooltip(true)}
                            onMouseLeave={() => setSuppressTooltip(false)}
                            className={clsx(
                                'flex h-10 w-10 items-center justify-center rounded-full border border-on-surface/10 backdrop-blur-md transition-[background-color,color,scale,box-shadow] duration-200 active:scale-95 motion-reduce:transition-none',
                                open
                                    ? 'bg-menu-highlight text-on-surface shadow-sm'
                                    : 'bg-on-surface/5 text-on-surface-variant hover:bg-menu-hover hover:text-on-surface'
                            )}
                        >
                            <MdSort className={clsx('text-xl transition-[scale] duration-200 motion-reduce:transition-none', open && 'scale-110')} />
                        </MenuButton>
                    </CustomTooltip>
                    <MenuItems
                        ref={menuRef}
                        modal={false}
                        transition
                        anchor="bottom end"
                        className="z-9999 w-56 origin-top-right rounded-xl border border-(--content-glass-edge) bg-(--content-glass-background) p-1 text-on-surface shadow-xl ring-1 ring-on-surface/5 backdrop-blur-lg backdrop-saturate-220 [--anchor-gap:8px] transition-[opacity,scale,translate] duration-150 ease-out data-closed:-translate-y-1 data-closed:scale-95 data-closed:opacity-0 focus:outline-none motion-reduce:transition-none"
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
