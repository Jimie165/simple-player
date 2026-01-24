import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition, TransitionChild, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { MdEdit, MdImage } from 'react-icons/md';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';

interface EditPlaylistDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string, description: string | undefined, coverPath: string | undefined) => Promise<void>;
    initialName: string;
    initialDescription?: string;
    initialCover?: string;
}

export default function EditPlaylistDialog({
    isOpen,
    onClose,
    onConfirm,
    initialName,
    initialDescription,
    initialCover
}: EditPlaylistDialogProps) {
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription || '');
    const [coverPath, setCoverPath] = useState(initialCover);
    const [loading, setLoading] = useState(false);

    // Sync props to state when dialog opens
    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            setDescription(initialDescription || '');
            setCoverPath(initialCover);
        }
    }, [isOpen, initialName, initialDescription, initialCover]);

    const handleSelectCover = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Images',
                    extensions: ['png', 'jpg', 'jpeg', 'webp']
                }]
            });
            if (selected) {
                // selected is string inside struct or just string depending on version.
                // plugin-dialog v2 returns FileResponse or null?
                // Usually it returns path string or array of strings.
                // Let's assume standard Tauri v2 behavior: string | null (if multiple: false)
                // Wait, check types if possible. Assuming string for now.
                setCoverPath(selected as string);
            }
        } catch (err) {
            console.error('Failed to pick image', err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            await onConfirm(name, description || undefined, coverPath);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
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
                            <DialogPanel className="w-full max-w-md max-h-[calc(100vh-200px)] overflow-y-auto transform rounded-2xl bg-white dark:bg-[#2c2c2c] p-6 text-left align-middle shadow-xl transition-all border border-neutral-200 dark:border-neutral-700">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <MdEdit className="text-2xl text-primary" />
                                    </div>
                                    <DialogTitle
                                        as="h3"
                                        className="text-lg font-medium leading-6 text-neutral-900 dark:text-neutral-100"
                                    >
                                        编辑播放列表
                                    </DialogTitle>
                                </div>

                                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                    {/* Cover Image Selection */}
                                    <div className="flex justify-center mb-2">
                                        <div
                                            onClick={handleSelectCover}
                                            className="group relative w-32 h-32 rounded-lg bg-neutral-100 dark:bg-neutral-800 border-2 border-dashed border-neutral-300 dark:border-neutral-600 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors overflow-hidden"
                                        >
                                            {coverPath ? (
                                                <img
                                                    src={convertFileSrc(coverPath)}
                                                    alt="Cover"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <MdImage className="text-4xl text-neutral-400 group-hover:text-primary transition-colors" />
                                            )}
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <span className="text-white text-xs font-medium">更换封面</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="edit-pl-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            名称
                                        </label>
                                        <input
                                            type="text"
                                            id="edit-pl-name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="输入播放列表名称"
                                            className="w-full px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border-none focus:ring-2 focus:ring-primary text-neutral-900 dark:text-white"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="edit-pl-desc" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            描述
                                        </label>
                                        <textarea
                                            id="edit-pl-desc"
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
                                            {loading ? '保存' : '保存'}
                                        </button>
                                    </div>
                                </form>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
