import { Fragment } from 'react';
import { Dialog, Transition, TransitionChild, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { MdLibraryAdd } from 'react-icons/md';

interface DuplicateSongConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: () => void;
    onSkip: () => void;
    duplicateCount: number;
}

export default function DuplicateSongConfirmDialog({
    isOpen,
    onClose,
    onAdd,
    onSkip,
    duplicateCount
}: DuplicateSongConfirmDialogProps) {
    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-[300]" onClose={onClose}>
                <DialogBackdrop
                    transition
                    className="fixed inset-0 bg-black/25 backdrop-blur-sm transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
                />

                <div className="fixed inset-0 overflow-y-auto">
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
                            <DialogPanel className="w-full max-w-sm transform overflow-hidden rounded-2xl bg-white dark:bg-[#2c2c2c] p-6 text-left align-middle shadow-xl transition-all border border-neutral-200 dark:border-neutral-700">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                                        <MdLibraryAdd className="text-xl text-primary" />
                                    </div>
                                    <DialogTitle
                                        as="h3"
                                        className="text-lg font-medium leading-6 text-neutral-900 dark:text-neutral-100"
                                    >
                                        发现重复歌曲
                                    </DialogTitle>
                                </div>

                                <div className="mt-2">
                                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                        有一些重复项目正在添加到播放列表。你要添加这些重复项目，还是跳过？
                                    </p>
                                    <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">
                                        检测到 {duplicateCount} 首重复歌曲。
                                    </p>
                                </div>

                                <div className="mt-6 flex justify-end gap-3">
                                    {/* Add Button (Left) */}
                                    <button
                                        type="button"
                                        className="inline-flex flex-1 justify-center rounded-full px-4 py-2 text-sm font-medium text-primary hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                        onClick={() => {
                                            onAdd();
                                            onClose();
                                        }}
                                    >
                                        添加
                                    </button>

                                    {/* Skip Button (Right) - Primary Action */}
                                    <button
                                        type="button"
                                        className="inline-flex flex-1 justify-center rounded-full border border-transparent bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                        onClick={() => {
                                            onSkip();
                                            onClose();
                                        }}
                                    >
                                        跳过
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
