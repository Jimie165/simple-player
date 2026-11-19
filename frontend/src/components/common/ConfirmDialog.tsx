import { DialogBackdrop, DialogPanel } from '@/components/common/DialogSurface';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Dialog, Transition, TransitionChild, DialogTitle } from '@headlessui/react';
import clsx from 'clsx';
import { MdWarningAmber } from 'react-icons/md';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    onCancel?: () => void;
    title: string;
    description: ReactNode;
    icon?: ReactNode;
    fullWidthActions?: boolean;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info';
}

export default function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    onCancel,
    title,
    description,
    icon,
    fullWidthActions = false,
    confirmText = '确认',
    cancelText = '取消',
    type = 'danger'
}: ConfirmDialogProps) {
    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-999" onClose={onClose}>
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
                            <DialogPanel className="w-[min(24rem,calc(100vw-1.5rem))] max-h-[calc(100vh-1.5rem)] transform overflow-y-auto rounded-2xl bg-surface p-6 text-left align-middle shadow-xl transition-all border border-(--dialog-outline-color) sm:w-full sm:max-w-sm sm:max-h-[calc(100vh-2rem)]">
                                <div className="flex items-center gap-3 mb-4">
                                    {icon ?? (type === 'danger' && (
                                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                                            <MdWarningAmber className="text-2xl text-red-600 dark:text-red-400" />
                                        </div>
                                    ))}
                                    <DialogTitle
                                        as="h3"
                                        className="text-lg font-medium leading-6 text-on-surface"
                                    >
                                        {title}
                                    </DialogTitle>
                                </div>

                                <div className="mt-2 text-sm text-on-surface-variant">
                                    {description}
                                </div>

                                <div className="mt-6 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        className={clsx(
                                            "inline-flex justify-center rounded-full px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                                            fullWidthActions && "flex-1 text-primary hover:text-primary"
                                        )}
                                        onClick={() => {
                                            if (onCancel) {
                                                onCancel();
                                                onClose();
                                            } else {
                                                onClose();
                                            }
                                        }}
                                    >
                                        {cancelText}
                                    </button>
                                    <button
                                        type="button"
                                        className={clsx(
                                            "inline-flex justify-center rounded-full px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-colors",
                                            fullWidthActions && "flex-1",
                                            type === 'danger'
                                                ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
                                                : "bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container text-on-primary hover:bg-primary/90 base-theme:dark:hover:bg-primary-container/80 focus-visible:ring-primary"
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
