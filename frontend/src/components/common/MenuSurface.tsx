import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { MenuItem } from '@headlessui/react';
import type { MenuItemData } from '@/hooks/menu/useSongOperations';

export const MenuSurface = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'> & { variant?: 'default' | 'apple' }>(
    function MenuSurface({ variant = 'default', className = '', ...props }, ref) {
        return <div
            {...props}
            ref={ref}
            className={`menu-surface fixed z-9999 w-56 rounded-xl border p-1 text-sm shadow-2xl ring-1 focus:outline-none pointer-events-auto ${variant === 'apple'
                ? 'bg-neutral-900/60 backdrop-blur-lg backdrop-saturate-220 border-white/5 ring-white/10 text-white'
                : 'border-(--content-glass-edge) bg-(--content-glass-background) backdrop-blur-lg backdrop-saturate-220 text-on-surface ring-on-surface/5'} ${className}`}
        />;
    },
);

export function MenuEntries({ groups, onClose, headless = false, variant = 'default' }: {
    groups: MenuItemData[][];
    onClose: () => void;
    headless?: boolean;
    variant?: 'default' | 'apple';
}) {
    const apple = variant === 'apple';
    return groups.map((group, index) => <div key={index}>
        {index > 0 && <div className={`my-1 h-px ${apple ? 'bg-white/10' : 'bg-on-surface/10'}`} />}
        {group.map(item => {
            const button = <button
                onClick={event => { event.stopPropagation(); item.onClick(); onClose(); }}
                className={`group flex w-full items-center gap-3 rounded-lg py-2 px-3 text-left transition-colors hover:bg-menu-hover data-focus:bg-menu-hover ${apple ? 'font-medium' : ''} ${item.variant === 'danger' ? (apple ? 'text-red-400' : 'text-red-600 dark:text-red-400') : ''}`}
            >
                <div className="flex flex-1 items-center gap-3">
                    {item.icon && <item.icon className={`text-lg ${apple ? '' : 'opacity-70'}`} />}
                    <span>{item.label}</span>
                </div>
                {!apple && item.suffix}
            </button>;
            return headless ? <MenuItem key={item.id}>{button}</MenuItem> : <div key={item.id}>{button}</div>;
        })}
    </div>);
}
