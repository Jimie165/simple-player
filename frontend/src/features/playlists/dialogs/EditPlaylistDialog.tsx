import { DialogBackdrop, DialogPanel } from '@/components/common/DialogSurface';
import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition, TransitionChild, DialogTitle } from '@headlessui/react';
import { MdImage, MdAdd, MdDeleteOutline } from 'react-icons/md';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getSelectedPath } from '@/utils/dialogSelection';

interface PlaylistFormDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string, description: string | undefined, coverPath: string | undefined) => Promise<void>;
    mode?: 'create' | 'edit';
    initialName?: string;
    initialDescription?: string;
    initialCover?: string;
}

export default function EditPlaylistDialog({
    isOpen,
    onClose,
    onConfirm,
    mode = 'edit',
    initialName = '',
    initialDescription,
    initialCover
}: PlaylistFormDialogProps) {
    const isCreate = mode === 'create';
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription || '');
    const [coverPath, setCoverPath] = useState(initialCover);
    const [loading, setLoading] = useState(false);

    // Sync props to state when dialog opens
    useEffect(() => {
        if (isOpen) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗打开时将初始属性同步到表单状态
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
            const imagePath = getSelectedPath(selected);
            if (imagePath) setCoverPath(imagePath);
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
            <Dialog as="div" className="relative z-9999" onClose={onClose}>
                <DialogBackdrop
                    transition
                    className="fixed inset-0 bg-black/25 backdrop-blur-sm transition-opacity data-closed:opacity-0 data-enter:duration-300 data-leave:duration-200 data-enter:ease-out data-leave:ease-in"
                />

                <div className="fixed inset-0 overflow-y-auto p-3 sm:p-4">
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
                            <DialogPanel className="w-[min(22.5rem,calc(100vw-1.5rem))] max-h-[calc(100vh-1.5rem)] transform overflow-hidden rounded-2xl bg-surface text-left align-middle shadow-xl transition-all border border-(--dialog-outline-color) flex flex-col sm:w-full sm:max-w-90 sm:max-h-[calc(100vh-2rem)]">
                                <form onSubmit={(event) => { void handleSubmit(event).catch(console.error); }} className="flex h-full min-h-0 flex-col">
                                    <div className="min-h-0 flex-1 overflow-y-auto p-6 pb-5 flex flex-col items-center">
                                        <DialogTitle
                                            as="h3"
                                            className="text-lg font-bold leading-6 text-on-surface mb-6 text-center w-full"
                                        >
                                            {isCreate ? '新建播放列表' : '编辑播放列表'}
                                        </DialogTitle>

                                        {/* Cover Image Selection */}
                                        <div className="flex flex-col items-center gap-2 mb-6 cursor-pointer">
                                            <div
                                                onClick={() => { void handleSelectCover().catch(console.error); }}
                                                className="group relative w-36 h-36 rounded-xl bg-on-surface/5 flex flex-col items-center justify-center transition-colors overflow-hidden border border-(--dialog-outline-color) shadow-sm"
                                            >
                                                {coverPath ? (
                                                    <img
                                                        src={convertFileSrc(coverPath)}
                                                        alt="Cover"
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <MdImage className="text-4xl text-on-surface-variant group-hover:text-primary transition-colors" />
                                                )}

                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200 backdrop-blur-[2px]">
                                                    <div className="w-10 h-10 rounded-full bg-primary/90 text-on-primary flex items-center justify-center shadow-lg">
                                                        <MdAdd className="text-xl" />
                                                    </div>
                                                </div>
                                            </div>
                                            {coverPath && (
                                                <button
                                                    type="button"
                                                    onClick={() => setCoverPath(undefined)}
                                                    className="inline-flex items-center gap-1 mt-1 text-xs text-red-500 hover:text-red-600 font-medium"
                                                >
                                                    <MdDeleteOutline className="text-sm" />
                                                    删除自定义封面
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-3 w-full">
                                            <div className="relative group">
                                                <input
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    placeholder="播放列表标题"
                                                    className="w-full px-3 py-2.5 pr-10 rounded-lg bg-transparent border border-(--dialog-outline-color) focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-on-surface placeholder:text-on-surface-variant/60"
                                                    required
                                                />
                                                {name && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setName('')}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-0 group-focus-within:opacity-100 hover:text-on-surface px-1 transition-opacity"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>

                                            <div className="relative group">
                                                <textarea
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    placeholder="描述 (可选)"
                                                    rows={3}
                                                    className="w-full px-3 py-2.5 pr-10 rounded-lg bg-transparent border border-(--dialog-outline-color) focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-on-surface placeholder:text-on-surface-variant/60 resize-none"
                                                />
                                                {description && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setDescription('')}
                                                        className="absolute right-3 top-3 text-on-surface-variant opacity-0 group-focus-within:opacity-100 hover:text-on-surface px-1 transition-opacity"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="shrink-0 px-6 py-4 bg-on-surface/3 border-t border-(--dialog-divider-color) flex gap-3">
                                        <button
                                            type="button"
                                            className="flex-1 justify-center rounded-lg px-4 py-2 text-sm font-medium text-on-surface-variant bg-transparent border border-(--dialog-outline-color) hover:bg-on-surface/5 hover:text-on-surface transition-colors focus:outline-none disabled:opacity-50"
                                            onClick={onClose}
                                            disabled={loading}
                                        >
                                            取消
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!name.trim() || loading}
                                            className="flex-1 justify-center rounded-lg px-4 py-2 text-sm font-medium text-on-primary bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container hover:bg-primary/90 base-theme:dark:hover:bg-primary-container/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {loading
                                                ? isCreate
                                                    ? '创建中...'
                                                    : '保存中...'
                                                : isCreate
                                                    ? '创建'
                                                    : '完成'}
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
