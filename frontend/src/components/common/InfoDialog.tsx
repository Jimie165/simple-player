import { Fragment } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { IoClose, IoMusicalNotes } from 'react-icons/io5';
import { usePlayerStore } from '../../store/usePlayerStore'; // 确保你已经建好了 store
import { formatTime } from '../../utils/time'; // 确保你已经建好了 utils

interface InfoDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function InfoDialog({ isOpen, onClose }: InfoDialogProps) {
    // 直接从 Store 获取当前播放的元数据
    const metadata = usePlayerStore((state) => state.metadata);

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-[999]" onClose={onClose}>
                {/* 遮罩层 */}
                <TransitionChild
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
                </TransitionChild>

                {/* 弹窗内容 */}
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
                            <DialogPanel className="w-auto min-w-[320px] max-w-[90vw] transform overflow-hidden rounded-2xl bg-white dark:bg-[#2c2c2c] p-6 text-left align-middle shadow-xl transition-all border border-neutral-200 dark:border-neutral-700">
                                <div className="flex justify-between items-center mb-4 gap-4">
                                    <DialogTitle as="h3" className="text-lg font-medium leading-6 text-neutral-900 dark:text-white whitespace-nowrap">
                                        属性
                                    </DialogTitle>
                                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                                        <IoClose className="text-xl" />
                                    </button>
                                </div>

                                <div className="mt-2 space-y-4">
                                    {/* 封面预览 */}
                                    <div className="flex justify-center mb-4">
                                        <div className="w-32 h-32 rounded-lg bg-neutral-100 dark:bg-neutral-800 overflow-hidden shadow-inner shrink-0">
                                            {metadata?.cover ? (
                                                <img src={metadata.cover} alt="Cover" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                                    <IoMusicalNotes className="text-4xl" />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 信息列表 */}
                                    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm whitespace-nowrap">
                                        <div className="text-neutral-500 dark:text-neutral-400 text-right">标题</div>
                                        <div className="font-medium text-neutral-900 dark:text-neutral-100 select-text">{metadata?.title || "未知"}</div>

                                        <div className="text-neutral-500 dark:text-neutral-400 text-right">艺人</div>
                                        <div className="font-medium text-neutral-900 dark:text-neutral-100 select-text">{metadata?.artist || "未知"}</div>

                                        <div className="text-neutral-500 dark:text-neutral-400 text-right">专辑</div>
                                        <div className="font-medium text-neutral-900 dark:text-neutral-100 select-text">{metadata?.album || "未知"}</div>

                                        <div className="text-neutral-500 dark:text-neutral-400 text-right">时长</div>
                                        <div className="font-medium text-neutral-900 dark:text-neutral-100">{formatTime(metadata?.duration || 0)}</div>
                                    </div>
                                </div>

                                <div className="mt-6 flex justify-end">
                                    <button
                                        type="button"
                                        className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-200 focus:outline-none dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
                                        onClick={onClose}
                                    >
                                        关闭
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