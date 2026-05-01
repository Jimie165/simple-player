import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'react-hot-toast';
import PageContainer from '@/components/layout/PageContainer';
import { useTheme } from '@/hooks/useTheme';
import { libraryService } from '@/services/libraryService';
import { audioService, type AudioOutputInfo } from '@/services/audioService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useAudioOutputStore } from '@/store/useAudioOutputStore';
import {
    MdBrightness6,
    MdRefresh,
    MdColorLens,
    MdCheck,
    MdAdd,
    MdLibraryMusic,
    MdWeb,
    MdFolder,
    MdDelete,
    MdClose,
    MdBlockFlipped,
    MdExpandMore,
    MdExpandLess,
    MdSpeaker
} from 'react-icons/md';
import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import TranscodeSettings from '@/features/settings/TranscodeSettings';
import { getName, getVersion } from '@tauri-apps/api/app';
import type { LibraryFolder } from '@/types';

export default function Settings() {
    const {
        theme,
        setTheme,
        sourceColor,
        setSourceColor,
        presetColors,
        isCustomColor,
        fullScreenMode,
        setFullScreenMode
    } = useTheme();

    const [isRefreshingMusic, setIsRefreshingMusic] = useState(false);
    const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);
    const [appVersion, setAppVersion] = useState('');
    const [appName, setAppName] = useState('');

    const triggerLibraryUpdate = useLibraryStore((s) => s.triggerLibraryUpdate);

    // 音频输出
    const preferredDevice = useAudioOutputStore((s) => s.preferredDevice);
    const activeDevice = useAudioOutputStore((s) => s.activeDevice);
    const setPreferredDevice = useAudioOutputStore((s) => s.setPreferredDevice);
    const [audioOutputs, setAudioOutputs] = useState<AudioOutputInfo[]>([]);
    const preferredDeviceAvailable = preferredDevice
        ? audioOutputs.some((device) => device.name === preferredDevice)
        : true;
    const selectedAudioOutput = preferredDeviceAvailable ? (preferredDevice ?? '') : '';
    const selectedAudioOutputLabel = selectedAudioOutput
        ? selectedAudioOutput
        : `跟随系统默认${activeDevice ? `（当前：${activeDevice}）` : ''}`;

    const reloadAudioOutputs = async () => {
        try {
            const list = await audioService.listAudioOutputs();
            setAudioOutputs(list);
        } catch (e) {
            console.error('Failed to load audio outputs', e);
        }
    };

    const handleAudioOutputChange = async (value: string) => {
        try {
            await setPreferredDevice(value === '' ? null : value);
            await reloadAudioOutputs();
        } catch (e: unknown) {
            toast.error(typeof e === 'string' ? e : e instanceof Error ? e.message : '切换音频输出失败');
        }
    };

    // 音乐文件夹管理
    const [musicFolders, setMusicFolders] = useState<LibraryFolder[]>([]);
    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [foldersExpanded, setFoldersExpanded] = useState(false);
    const FOLDER_PREVIEW_COUNT = 3;

    const reloadFolders = async () => {
        try {
            const all = await libraryService.getFolders();
            setMusicFolders(all.filter((f) => f.folder_type === 'music'));
        } catch (e) {
            console.error('Failed to load folders', e);
        }
    };

    const handleAddFolder = async () => {
        if (isAddingFolder) return;
        try {
            const selected = await open({ directory: true, multiple: false });
            if (!selected || typeof selected !== 'string') return;
            setIsAddingFolder(true);
            await libraryService.addFolder(selected);
            await reloadFolders();
            triggerLibraryUpdate();
            toast.success('已添加文件夹，正在后台扫描...', { id: 'add-folder' });
        } catch (e: unknown) {
            const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
            toast.error(msg || '添加失败', { id: 'add-folder' });
        } finally {
            setIsAddingFolder(false);
        }
    };

    const handleRemoveFolder = async (folder: LibraryFolder) => {
        if (!confirm(`确定移除文件夹？\n${folder.path}\n该目录下的歌曲会从音乐库删除（收藏与播放列表中的引用一并清理）。`)) {
            return;
        }
        try {
            await libraryService.removeFolder(folder.path);
            await reloadFolders();
            triggerLibraryUpdate();
            toast.success('已移除文件夹', { id: 'remove-folder' });
        } catch (e) {
            console.error(e);
            toast.error('移除失败', { id: 'remove-folder' });
        }
    };

    // 扫描忽略目录
    const [ignoredDirs, setIgnoredDirs] = useState<string[]>([]);
    const [ignoredInput, setIgnoredInput] = useState('');
    const [savingIgnored, setSavingIgnored] = useState(false);

    const reloadIgnoredDirs = async () => {
        try {
            const list = await libraryService.getIgnoredDirNames();
            setIgnoredDirs(list);
        } catch (e) {
            console.error('Failed to load ignored dirs', e);
        }
    };

    const persistIgnoredDirs = async (next: string[]) => {
        if (savingIgnored) return;
        setSavingIgnored(true);
        try {
            const saved = await libraryService.setIgnoredDirNames(next);
            setIgnoredDirs(saved);
        } catch (e) {
            console.error(e);
            toast.error('保存忽略列表失败', { id: 'ignored-dirs' });
        } finally {
            setSavingIgnored(false);
        }
    };

    const addIgnoredDir = () => {
        const name = ignoredInput.trim();
        if (!name) return;
        if (ignoredDirs.some((d) => d.toLowerCase() === name.toLowerCase())) {
            setIgnoredInput('');
            return;
        }
        const next = [...ignoredDirs, name];
        setIgnoredInput('');
        persistIgnoredDirs(next);
    };

    const removeIgnoredDir = (name: string) => {
        const next = ignoredDirs.filter((d) => d !== name);
        persistIgnoredDirs(next);
    };

    useEffect(() => {
        reloadFolders();
        reloadIgnoredDirs();
        reloadAudioOutputs();
    }, []);

    // Refresh device list when backend reports active device changed.
    useEffect(() => {
        reloadAudioOutputs();
    }, [activeDevice]);

    useEffect(() => {
        const fetchAppInfo = async () => {
            try {
                const name = await getName();
                const version = await getVersion();
                setAppName(name);
                setAppVersion(version);
            } catch (error) {
                console.error('Failed to get app info', error);
            }
        };
        fetchAppInfo();
    }, []);

    const handleRefreshMusicLibrary = async () => {
        if (isRefreshingMusic) return;
        setIsRefreshingMusic(true);
        try {
            await libraryService.refreshLibrary();
        } catch (error) {
            console.error('Failed to refresh music library', error);
        } finally {
            setTimeout(() => setIsRefreshingMusic(false), 800);
        }
    };

    const handleRefreshVideoLibrary = async () => {
        if (isRefreshingVideo) return;
        setIsRefreshingVideo(true);
        try {
            await libraryService.refreshVideoLibrary();
        } catch (error) {
            console.error('Failed to refresh video library', error);
        } finally {
            setTimeout(() => setIsRefreshingVideo(false), 800);
        }
    };

    const ThemeOption = ({ val, label }: { val: 'light' | 'dark' | 'system', label: string }) => (
        <button
            onClick={() => setTheme(val)}
            className={clsx(
                "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all border",
                theme === val
                    ? "bg-primary/10 text-primary border-primary/30 ring-1 ring-primary/20"
                    : "bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-highest"
            )}
        >
            <span>{label}</span>
            {theme === val && <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--md-sys-color-primary),0.5)]" />}
        </button>
    );

    return (
        <PageContainer title="设置">
            <div className="w-full pb-20">
                <div className="columns-1 lg:columns-2 gap-6 [&>*]:break-inside-avoid [&>*]:mb-6">

                        {/* 1. 常规设置 (Refresh Library) */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                                <MdLibraryMusic className="text-lg" />
                                <span>常规设置</span>
                            </div>

                            {/* M3 Expressive Style: Grouped container with hairline gap */}
                            <div className="flex flex-col gap-[2px] rounded-2xl overflow-hidden border border-outline-variant/30 bg-outline-variant/20">
                                {/* Refresh Music */}
                                <div className="flex items-center justify-between p-4 bg-surface-container-high hover:bg-surface-container-highest transition-colors">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-base font-medium text-on-surface">刷新音乐库</span>
                                        <span className="text-sm text-on-surface-variant">重新扫描音乐文件夹并更新元数据</span>
                                    </div>
                                    <button
                                        onClick={handleRefreshMusicLibrary}
                                        disabled={isRefreshingMusic}
                                        className={clsx(
                                            "flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all active:scale-95",
                                            isRefreshingMusic
                                                ? "bg-surface-container-highest text-on-surface-variant cursor-wait"
                                                : "bg-primary text-on-primary hover:shadow-md hover:brightness-110"
                                        )}
                                    >
                                        <MdRefresh className={clsx("text-lg", isRefreshingMusic && "animate-spin")} />
                                        {isRefreshingMusic ? '刷新中...' : '刷新'}
                                    </button>
                                </div>

                                {/* Refresh Video */}
                                <div className="flex items-center justify-between p-4 bg-surface-container-high hover:bg-surface-container-highest transition-colors">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-base font-medium text-on-surface">刷新视频库</span>
                                        <span className="text-sm text-on-surface-variant">重新扫描视频文件夹并更新缩略图</span>
                                    </div>
                                    <button
                                        onClick={handleRefreshVideoLibrary}
                                        disabled={isRefreshingVideo}
                                        className={clsx(
                                            "flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all active:scale-95",
                                            isRefreshingVideo
                                                ? "bg-surface-container-highest text-on-surface-variant cursor-wait"
                                                : "bg-primary text-on-primary hover:shadow-md hover:brightness-110"
                                        )}
                                    >
                                        <MdRefresh className={clsx("text-lg", isRefreshingVideo && "animate-spin")} />
                                        {isRefreshingVideo ? '刷新中...' : '刷新'}
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* 1.5 音乐文件夹管理 */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                                <MdFolder className="text-lg" />
                                <span>音乐文件夹</span>
                            </div>

                            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 bg-surface-container-high">
                                {musicFolders.length === 0 ? (
                                    <div className="p-4 text-sm text-on-surface-variant">
                                        尚未添加任何音乐文件夹
                                    </div>
                                ) : (
                                    <>
                                        <ul className="divide-y divide-outline-variant/30">
                                            {(foldersExpanded ? musicFolders : musicFolders.slice(0, FOLDER_PREVIEW_COUNT)).map((folder) => (
                                                <li
                                                    key={folder.id}
                                                    className="flex items-center justify-between gap-3 p-4 hover:bg-surface-container-highest transition-colors"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-medium text-on-surface truncate">
                                                            {folder.path}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveFolder(folder)}
                                                        className="flex items-center justify-center w-9 h-9 rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors active:scale-95 shrink-0"
                                                        title="移除此文件夹"
                                                    >
                                                        <MdDelete className="text-lg" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                        {musicFolders.length > FOLDER_PREVIEW_COUNT && (
                                            <button
                                                onClick={() => setFoldersExpanded((v) => !v)}
                                                className="flex items-center justify-center gap-1 w-full py-2.5 text-sm font-medium text-primary hover:bg-surface-container-highest transition-colors border-t border-outline-variant/30"
                                            >
                                                {foldersExpanded ? (
                                                    <>
                                                        <MdExpandLess className="text-lg" />
                                                        收起
                                                    </>
                                                ) : (
                                                    <>
                                                        <MdExpandMore className="text-lg" />
                                                        展开剩余 {musicFolders.length - FOLDER_PREVIEW_COUNT} 项
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </>
                                )}
                                <div className="p-3 border-t border-outline-variant/30 bg-surface-container">
                                    <button
                                        onClick={handleAddFolder}
                                        disabled={isAddingFolder}
                                        className={clsx(
                                            "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-medium text-sm transition-all active:scale-95",
                                            isAddingFolder
                                                ? "bg-surface-container-highest text-on-surface-variant cursor-wait"
                                                : "bg-primary text-on-primary hover:shadow-md hover:brightness-110"
                                        )}
                                    >
                                        <MdAdd className="text-lg" />
                                        {isAddingFolder ? '添加中...' : '添加文件夹'}
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* 1.7 扫描忽略目录 */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                                <MdBlockFlipped className="text-lg" />
                                <span>扫描忽略目录</span>
                            </div>

                            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-high p-4 space-y-3">
                                <p className="text-sm text-on-surface-variant">
                                    扫描时会跳过名称匹配以下任一项的目录（不区分大小写）。常用于排除项目目录里的非音乐内容。
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {ignoredDirs.length === 0 && (
                                        <span className="text-sm text-on-surface-variant/70">列表为空，扫描时不会忽略任何目录</span>
                                    )}
                                    {ignoredDirs.map((name) => (
                                        <span
                                            key={name}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary-container text-on-secondary-container text-sm"
                                        >
                                            {name}
                                            <button
                                                onClick={() => removeIgnoredDir(name)}
                                                className="ml-1 -mr-1 w-5 h-5 rounded-full flex items-center justify-center hover:bg-on-secondary-container/10 active:scale-90"
                                                title="移除"
                                            >
                                                <MdClose className="text-sm" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={ignoredInput}
                                        onChange={(e) => setIgnoredInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addIgnoredDir();
                                            }
                                        }}
                                        placeholder="输入目录名后回车添加，例如 node_modules"
                                        className="flex-1 px-3 py-2 rounded-xl bg-surface-container text-sm text-on-surface placeholder:text-on-surface-variant/60 border border-outline-variant/30 focus:outline-none focus:border-primary/50"
                                    />
                                    <button
                                        onClick={addIgnoredDir}
                                        disabled={!ignoredInput.trim() || savingIgnored}
                                        className={clsx(
                                            "px-4 py-2 rounded-xl font-medium text-sm transition-all active:scale-95",
                                            !ignoredInput.trim() || savingIgnored
                                                ? "bg-surface-container-highest text-on-surface-variant cursor-not-allowed"
                                                : "bg-primary text-on-primary hover:shadow-md hover:brightness-110"
                                        )}
                                    >
                                        添加
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* 1.8 音频输出 */}
                        {audioOutputs.length > 0 && (
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                                    <MdSpeaker className="text-lg" />
                                    <span>音频输出</span>
                                </div>

                                <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-high p-4 space-y-3">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-base font-medium text-on-surface">输出设备</span>
                                        <span className="text-sm text-on-surface-variant">
                                            选择「跟随系统默认」时，切换 Windows 默认输出会自动跟随。
                                        </span>
                                    </div>
                                    <Listbox
                                        value={selectedAudioOutput}
                                        onChange={handleAudioOutputChange}
                                    >
                                        {({ open }) => (
                                            <div className="relative">
                                                <ListboxButton
                                                    className={clsx(
                                                        "flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-surface-container text-sm text-on-surface border transition-all duration-200 focus:outline-none",
                                                        open
                                                            ? "border-primary/50 ring-1 ring-primary/20 rounded-b-none"
                                                            : "border-outline-variant/30 hover:border-primary/30"
                                                    )}
                                                >
                                                    <span className="truncate">
                                                        {selectedAudioOutputLabel}
                                                    </span>
                                                    <MdExpandMore
                                                        className={clsx(
                                                            "text-lg text-on-surface-variant transition-transform duration-300",
                                                            open && "rotate-180"
                                                        )}
                                                    />
                                                </ListboxButton>

                                                <AnimatePresence>
                                                    {open && (
                                                        <ListboxOptions
                                                            static
                                                            anchor="bottom"
                                                            as={motion.div}
                                                            initial={{ opacity: 0, y: -10 }}
                                                            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } }}
                                                            exit={{ opacity: 0, y: -10, transition: { duration: 0.2, ease: "easeOut" } }}
                                                            className="z-50 w-[var(--button-width)] mt-[-1px] rounded-b-xl border border-primary/50 border-t-0 bg-surface-container-high shadow-xl focus:outline-none overflow-hidden"
                                                        >
                                                            <div className="py-1 max-h-60 overflow-y-auto scrollbar-hidden">
                                                                <ListboxOption
                                                                    value=""
                                                                    className="group flex items-center justify-between px-4 py-2 text-sm cursor-pointer data-[focus]:bg-primary/10 data-[selected]:text-primary"
                                                                >
                                                                    <div className="flex flex-col">
                                                                        <span>跟随系统默认</span>
                                                                        {activeDevice && (
                                                                            <span className="text-[10px] text-on-surface-variant opacity-70">
                                                                                当前：{activeDevice}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {!selectedAudioOutput && <MdCheck className="text-primary" />}
                                                                </ListboxOption>

                                                                {audioOutputs.map((d) => (
                                                                    <ListboxOption
                                                                        key={d.name}
                                                                        value={d.name}
                                                                        className="group flex items-center justify-between px-4 py-2 text-sm cursor-pointer data-[focus]:bg-primary/10 data-[selected]:text-primary"
                                                                    >
                                                                        <div className="flex flex-col">
                                                                            <span>{d.name}</span>
                                                                            {d.is_system_default && (
                                                                                <span className="text-[10px] text-on-surface-variant opacity-70">
                                                                                    系统默认设备
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {selectedAudioOutput === d.name && <MdCheck className="text-primary" />}
                                                                    </ListboxOption>
                                                                ))}
                                                            </div>
                                                        </ListboxOptions>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        )}
                                    </Listbox>
                                </div>
                            </section>
                        )}

                        {/* 2. 外观设置 (Moved to Left Column) */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                                <MdBrightness6 className="text-lg" />
                                <span>外观与主题</span>
                            </div>

                            {/* Mode Selection */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-medium text-on-surface px-1">主题模式</h4>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <ThemeOption val="light" label="浅色模式" />
                                    <ThemeOption val="dark" label="深色模式" />
                                    <ThemeOption val="system" label="跟随系统" />
                                </div>
                            </div>

                            {/* Full Screen Style Selection */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                    <MdWeb className="text-primary text-lg" />
                                    <h4 className="text-sm font-medium text-on-surface">播放页样式</h4>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <button
                                        onClick={() => setFullScreenMode('classic')}
                                        className={clsx(
                                            "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all border",
                                            fullScreenMode === 'classic'
                                                ? "bg-primary/10 text-primary border-primary/30 ring-1 ring-primary/20"
                                                : "bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-highest"
                                        )}
                                    >
                                        <span>经典</span>
                                        {fullScreenMode === 'classic' && <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--md-sys-color-primary),0.5)]" />}
                                    </button>
                                    <button
                                        onClick={() => setFullScreenMode('immersive')}
                                        className={clsx(
                                            "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all border",
                                            fullScreenMode === 'immersive'
                                                ? "bg-primary/10 text-primary border-primary/30 ring-1 ring-primary/20"
                                                : "bg-surface-container-high border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-highest"
                                        )}
                                    >
                                        <span>沉浸</span>
                                        {fullScreenMode === 'immersive' && <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--md-sys-color-primary),0.5)]" />}
                                    </button>
                                </div>
                            </div>

                            {/* Color Selection */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <h4 className="text-sm font-medium text-on-surface">应用配色</h4>
                                    <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 px-2 py-1 rounded-md">
                                        <MdColorLens />
                                        <span>主题颜色</span>
                                    </div>
                                </div>

                                <div className="bg-surface-container-high rounded-2xl border border-outline-variant/30 p-5">
                                    <div className="flex flex-wrap gap-4 items-center">
                                        {/* Presets */}
                                        {presetColors.map((color) => {
                                            const isSelected = !isCustomColor && sourceColor === color.value;
                                            return (
                                                <button
                                                    key={color.id}
                                                    onClick={() => setSourceColor(color.value, false)}
                                                    className="group relative w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none"
                                                    title={color.name}
                                                >
                                                    <div
                                                        className="absolute inset-0 rounded-full border border-outline-variant/20 shadow-sm"
                                                        style={{ backgroundColor: color.value }}
                                                    />
                                                    {isSelected && (
                                                        <MdCheck className="relative z-10 text-white text-xl drop-shadow-md" />
                                                    )}
                                                </button>
                                            );
                                        })}

                                        {/* Divider */}
                                        <div className="w-px h-8 bg-outline-variant/30 mx-2" />

                                        {/* Custom Picker */}
                                        <div className="relative group">
                                            <div
                                                className={clsx(
                                                    "w-12 h-12 rounded-full flex items-center justify-center border transition-all cursor-pointer overflow-hidden",
                                                    isCustomColor
                                                        ? "border-primary ring-2 ring-primary/30"
                                                        : "border-outline-variant/50 border-dashed hover:border-primary/50"
                                                )}
                                            >
                                                {isCustomColor ? (
                                                    <div
                                                        className="w-full h-full"
                                                        style={{ backgroundColor: sourceColor }}
                                                    />
                                                ) : (
                                                    <MdAdd className="text-2xl text-on-surface-variant" />
                                                )}

                                                {/* Invisible Color Input covering the button */}
                                                <input
                                                    type="color"
                                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                    value={sourceColor}
                                                    onChange={(e) => setSourceColor(e.target.value, true)}
                                                    title="自定义颜色"
                                                />
                                            </div>
                                            {isCustomColor && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <MdCheck className="text-white text-xl drop-shadow-md mix-blend-difference" />
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-sm text-on-surface-variant ml-2">自定义</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <TranscodeSettings />

                        {/* About Info */}
                        <section className="rounded-2xl bg-surface-container-high p-6 border border-outline-variant/30">
                            <h3 className="text-lg font-semibold mb-2 text-on-surface">关于 {appName || 'Simple Player'}</h3>
                            <p className="text-sm text-on-surface-variant leading-relaxed">
                                这是一个基于 Tauri v2 和 React 构建的本地音乐播放器。
                            </p>
                            <div className="mt-4 flex gap-4 text-xs text-on-surface-variant/70">
                                <span>Version: {appVersion}</span>
                                <span>•</span>
                                <span>Made by Jimie165</span>
                            </div>
                        </section>
                </div>
            </div>
        </PageContainer>
    );
}
