import { Menu, MenuButton, MenuItems, MenuItem, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { VscColorMode } from 'react-icons/vsc';
import { useTheme } from '../hooks/useTheme';
import clsx from 'clsx';

export default function ThemeMenu() {
    const { theme, setTheme } = useTheme();

    const options = [
        { value: 'light', label: '浅色模式 (Light)' },
        { value: 'dark', label: '深色模式 (Dark)' },
        { value: 'system', label: '跟随系统 (System)' },
    ] as const;

    return (
        <div className="relative inline-block text-left z-50">
            <Menu as="div" className="relative">
                <MenuButton className="
          flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all
          bg-neutral-100 text-neutral-900 hover:bg-neutral-200
          dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700
          shadow-sm border border-neutral-200 dark:border-neutral-700
        ">
                    <VscColorMode className="text-lg" />
                    <span>
                        {theme === 'system' ? '跟随系统' : theme === 'dark' ? '深色' : '浅色'}
                    </span>
                </MenuButton>

                <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                >
                    <MenuItems className="
            absolute right-0 mt-2 w-40 origin-top-right divide-y divide-gray-100 rounded-xl 
            bg-white dark:bg-neutral-800 
            shadow-lg ring-1 ring-black/5 focus:outline-none
            border border-neutral-200 dark:border-neutral-700
          ">
                        <div className="p-1">
                            {options.map((opt) => (
                                <MenuItem key={opt.value}>
                                    {({ active }) => (
                                        <button
                                            onClick={() => setTheme(opt.value)}
                                            className={clsx(
                                                'group flex w-full items-center rounded-lg px-2 py-2 text-sm transition-colors',
                                                active
                                                    ? 'bg-blue-500 text-white'
                                                    : 'text-neutral-900 dark:text-neutral-200',
                                                // 选中状态的高亮
                                                theme === opt.value && !active && 'bg-blue-50 text-blue-600 dark:bg-white/5 dark:text-blue-400'
                                            )}
                                        >
                                            {opt.label}
                                        </button>
                                    )}
                                </MenuItem>
                            ))}
                        </div>
                    </MenuItems>
                </Transition>
            </Menu>
        </div>
    );
}