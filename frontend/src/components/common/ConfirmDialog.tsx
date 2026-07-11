import { Fragment } from 'react';
import { Dialog, Transition, TransitionChild, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import clsx from 'clsx';
import { MdWarningAmber } from 'react-icons/md';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info';
}

export default function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = '确认',
    cancelText = '取消',
    type = 'danger'
}: ConfirmDialogProps) {
    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <DialogBackdrop
                    transition
                    className="fixed inset-0 bg-black/25 backdrop-blur-sm transition-opacity data-closed:opacity-0 data-enter:duration-300 data-leave:duration-200 data-enter:ease-out data-leave:ease-in"
                />

                <div className="fixed inset-0 overflow-y-auto p-3 sm:p-4">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="w-[min(24rem,calc(100vw-1.5rem))] max-h-[calc(100vh-1.5rem)] transform overflow-y-auto rounded-2xl bg-white dark:bg-[#2c2c2c] p-6 text-left align-middle shadow-xl transition-all border border-neutral-200 dark:border-neutral-700 sm:w-full sm:max-w-sm sm:max-h-[calc(100vh-2rem)]">
                                <div className="flex items-center gap-3 mb-4">
                                    {type === 'danger' && (
                                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                            <MdWarningAmber className="text-2xl text-red-600 dark:text-red-400" />
                                        </div>
                                    )}
                                    <DialogTitle
                                        as="h3"
                                        className="text-lg font-medium leading-6 text-neutral-900 dark:text-neutral-100"
                                    >
                                        {title}
                                    </DialogTitle>
                                </div>

                                <div className="mt-2">
                                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                        {description}
                                    </p>
                                </div>

                                <div className="mt-6 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        className="inline-flex justify-center rounded-full px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2"
                                        onClick={onClose}
                                    >
                                        {cancelText}
                                    </button>
                                    <button
                                        type="button"
                                        className={clsx(
                                            "inline-flex justify-center rounded-full px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-colors",
                                            type === 'danger'
                                                ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
                                                : "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500"
                                        )}
                                        onClick={() => {
                                            onConfirm();
                                            onClose();
                                        }}
                                    >
                                        {confirmText}
                                    </button>
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
