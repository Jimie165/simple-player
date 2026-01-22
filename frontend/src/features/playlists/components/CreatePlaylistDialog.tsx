import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { MdAdd } from 'react-icons/md';

interface CreatePlaylistDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string, description?: string) => Promise<void>;
}

export default function CreatePlaylistDialog({
    isOpen,
    onClose,
    onConfirm
}: CreatePlaylistDialogProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            await onConfirm(name, description || undefined);
            onClose();
            // Reset form
            setName('');
            setDescription('');
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-[#2c2c2c] p-6 text-left align-middle shadow-xl transition-all border border-neutral-200 dark:border-neutral-700">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <MdAdd className="text-2xl text-primary" />
                                    </div>
                                    <Dialog.Title
                                        as="h3"
                                        className="text-lg font-medium leading-6 text-neutral-900 dark:text-neutral-100"
                                    >
                                        新建播放列表
                                    </Dialog.Title>
                                </div>

                                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                    <div>
                                        <label htmlFor="pl-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            名称
                                        </label>
                                        <input
                                            type="text"
                                            id="pl-name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="输入播放列表名称"
                                            className="w-full px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border-none focus:ring-2 focus:ring-primary text-neutral-900 dark:text-white"
                                            autoFocus
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="pl-desc" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            描述 (可选)
                                        </label>
                                        <textarea
                                            id="pl-desc"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="添加描述..."
                                            rows={3}
                                            className="w-full px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border-none focus:ring-2 focus:ring-primary text-neutral-900 dark:text-white resize-none"
                                        />
                                    </div>

                                    <div className="mt-4 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            className="inline-flex justify-center rounded-full px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700 transition-colors focus:outline-none"
                                            onClick={onClose}
                                            disabled={loading}
                                        >
                                            取消
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!name.trim() || loading}
                                            className="inline-flex justify-center rounded-full px-6 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {loading ? '创建中...' : '创建'}
                                        </button>
                                    </div>
                                </form>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
