import { Fragment } from 'react';
import type React from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MdClose } from 'react-icons/md';

export interface MetadataEditTab<T extends string> {
    id: T;
    label: string;
}

interface MetadataEditDialogShellProps<T extends string> {
    isOpen: boolean;
    saving: boolean;
    cancelFirst?: boolean;
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
    cancelFirst = false,
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
    const button = 'rounded-lg border border-neutral-200 px-4 py-2 text-sm dark:border-white/15 disabled:opacity-40';
    const confirmButton = (
        <button
            key="confirm"
            type="submit"
            disabled={saving}
            className={`${button} bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container text-on-primary`}
        >
            {saving ? '保存中...' : '确定'}
        </button>
    );
    const cancelButton = (
        <button
            key="cancel"
            type="button"
            onClick={onClose}
            disabled={saving}
            className={button}
        >
            取消
        </button>
    );
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
                            as="div"
                            className="h-[min(820px,calc(100vh-1rem))] w-[min(640px,calc(100vw-1rem))] transition-[opacity,transform,scale] sm:h-[min(820px,calc(100vh-2rem))] sm:w-[min(640px,calc(100vw-2rem))]"
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="relative h-full w-full overflow-hidden rounded-xl bg-surface text-left align-middle shadow-2xl sm:rounded-md">
                                <motion.form onSubmit={onSubmit} inert={Boolean(replacementView)} animate={{ x: replacementView && !reducedMotion ? -32 : 0, opacity: replacementView ? 0 : 1 }} transition={{ duration: reducedMotion ? 0 : 0.22 }} className="flex h-full min-h-0 flex-col">
                                    <DialogTitle className="sr-only">{title}</DialogTitle>
                                    <div className="relative shrink-0 px-6 pt-7">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            disabled={saving}
                                            className="absolute right-6 top-4 grid h-8 w-8 place-items-center text-neutral-900 transition-colors hover:text-[#ff2d46] disabled:opacity-50 dark:text-neutral-100"
                                        >
                                            <MdClose className="text-2xl" />
                                        </button>

                                        <div className="flex items-start gap-3 pr-10">
                                            <div className="h-19 w-19 shrink-0 overflow-hidden rounded-[5px] bg-neutral-100 shadow-sm ring-1 ring-black/5 dark:bg-neutral-800 dark:ring-white/10">
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
                                                            ? 'text-neutral-950 dark:text-neutral-50'
                                                            : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
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
                                            {cancelFirst ? [cancelButton, confirmButton] : [confirmButton, cancelButton]}
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
