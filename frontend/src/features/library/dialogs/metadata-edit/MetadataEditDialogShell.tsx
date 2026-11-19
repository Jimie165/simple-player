import { DialogBackdrop, DialogPanel } from '@/components/common/DialogSurface';
import { Fragment } from 'react';
import type React from 'react';
import { Dialog, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MdClose } from 'react-icons/md';

export interface MetadataEditTab<T extends string> {
    id: T;
    label: string;
}

interface MetadataEditDialogShellProps<T extends string> {
    isOpen: boolean;
    saving: boolean;
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
    title: string;
    cover: React.ReactNode;
    header: React.ReactNode;
    tabs: Array<MetadataEditTab<T>>;
    activeTab: T;
    onTabChange: (tab: T) => void;
    tabLayoutId: string;
    scrollContent: boolean;
    message?: string;
    footerStart?: React.ReactNode;
    children: React.ReactNode;
    replacementView?: React.ReactNode;
}

export default function MetadataEditDialogShell<T extends string>({
    isOpen,
    saving,
    onClose,
    onSubmit,
    title,
    cover,
    header,
    tabs,
    activeTab,
    onTabChange,
    tabLayoutId,
    scrollContent,
    message,
    footerStart,
    children,
    replacementView,
}: MetadataEditDialogShellProps<T>) {
    const reducedMotion = useReducedMotion();
    const button = 'rounded-lg border border-(--dialog-outline-color) px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40';
    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-9999" onClose={saving ? () => undefined : onClose}>
                <DialogBackdrop
                    transition
                    className="fixed inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity data-closed:opacity-0 data-enter:duration-300 data-leave:duration-200 data-enter:ease-out data-leave:ease-in"
                />
                <div className="fixed inset-0 overflow-y-auto p-2 sm:p-4">
                    <div className="flex min-h-full items-center justify-center text-center">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="relative h-[min(820px,calc(100vh-1rem))] w-[min(640px,calc(100vw-1rem))] overflow-hidden rounded-xl bg-surface text-left align-middle shadow-2xl transition-[opacity,transform,scale] sm:h-[min(820px,calc(100vh-2rem))] sm:w-[min(640px,calc(100vw-2rem))] sm:rounded-md">
                                <motion.form onSubmit={onSubmit} inert={Boolean(replacementView)} animate={{ x: replacementView && !reducedMotion ? -32 : 0, opacity: replacementView ? 0 : 1 }} transition={{ duration: reducedMotion ? 0 : 0.22 }} className="flex h-full min-h-0 flex-col">
                                    <DialogTitle className="sr-only">{title}</DialogTitle>
                                    <div className="relative shrink-0 px-6 pt-7">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            disabled={saving}
                                            className="absolute right-6 top-4 grid h-8 w-8 place-items-center text-on-surface transition-colors hover:text-[#ff2d46] disabled:opacity-50"
                                        >
                                            <MdClose className="text-2xl" />
                                        </button>

                                        <div className="flex items-start gap-3 pr-10">
                                            <div className="h-19 w-19 shrink-0 overflow-hidden rounded-[5px] bg-on-surface/5 shadow-sm border border-(--dialog-outline-color)">
                                                {cover}
                                            </div>
                                            <div className="min-w-0 pt-1">{header}</div>
                                        </div>

                                        <div className="mt-8 flex justify-center">
                                            <div className="flex items-center gap-9 overflow-x-auto px-2 text-[16px] font-bold">
                                                {tabs.map(tab => (
                                                    <button
                                                        key={tab.id}
                                                        type="button"
                                                        onClick={() => onTabChange(tab.id)}
                                                        className={`relative whitespace-nowrap pb-4 transition-colors ${activeTab === tab.id
                                                            ? 'text-on-surface'
                                                            : 'text-on-surface-variant hover:text-on-surface'
                                                            }`}
                                                    >
                                                        {tab.label}
                                                        {activeTab === tab.id && (
                                                            <motion.span
                                                                layoutId={tabLayoutId}
                                                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                                                className="absolute bottom-0 left-0 h-1 w-full rounded-full bg-primary"
                                                            />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`min-h-0 flex-1 px-6 py-4 ${scrollContent ? 'overflow-y-auto' : 'overflow-hidden'}`}>
                                        {children}
                                        {message && <div className="mt-4 text-sm text-red-500">{message}</div>}
                                    </div>

                                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-6 pb-4 pt-3">
                                        <div>{footerStart}</div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                disabled={saving}
                                                className={`${button} text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface`}
                                            >
                                                取消
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className={`${button} border-transparent bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container text-on-primary hover:bg-primary/90 base-theme:dark:hover:bg-primary-container/80`}
                                            >
                                                {saving ? '保存中...' : '完成'}
                                            </button>
                                        </div>
                                    </div>
                                </motion.form>
                                <AnimatePresence>
                                    {replacementView && (
                                        <motion.div key="replacement" initial={{ x: reducedMotion ? 0 : 48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: reducedMotion ? 0 : 48, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.22, ease: 'easeOut' }} className="absolute inset-0 z-20" inert={!replacementView}>
                                            {replacementView}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
