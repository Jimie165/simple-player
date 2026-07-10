import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { MdBlockFlipped, MdClose } from 'react-icons/md';
import clsx from 'clsx';

import { libraryService, type ScopedIgnoredDirNames } from '@/services/libraryService';

type IgnoreScope = keyof ScopedIgnoredDirNames;

const EMPTY_IGNORED_DIRS: ScopedIgnoredDirNames = {
    common: [],
    music: [],
    video: [],
};

const SCOPE_CONFIG: Record<IgnoreScope, { title: string; emptyText: string; placeholder: string; description: string }> = {
    common: {
        title: '通用忽略目录',
        emptyText: '列表为空，音乐库和视频库不会共用额外忽略目录',
        placeholder: '输入通用忽略的目录名',
        description: '同时应用于音乐库和视频库扫描。',
    },
    music: {
        title: '音乐库忽略目录',
        emptyText: '列表为空，音乐库只使用通用忽略目录',
        placeholder: '输入仅音乐库忽略的目录名',
        description: '只应用于音乐库扫描。',
    },
    video: {
        title: '视频库忽略目录',
        emptyText: '列表为空，视频库只使用通用忽略目录',
        placeholder: '输入仅视频库忽略的目录名',
        description: '只应用于视频库扫描。',
    },
};

export default function IgnoredDirsSection() {
    const [ignoredDirs, setIgnoredDirs] = useState<ScopedIgnoredDirNames>(EMPTY_IGNORED_DIRS);
    const [inputs, setInputs] = useState<Record<IgnoreScope, string>>({
        common: '',
        music: '',
        video: '',
    });
    const [savingIgnored, setSavingIgnored] = useState(false);

    useEffect(() => {
        let cancelled = false;

        libraryService.getScopedIgnoredDirNames()
            .then((list) => {
                if (!cancelled) {
                    setIgnoredDirs(list);
                }
            })
            .catch((e) => {
                console.error('Failed to load ignored dirs', e);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const persistIgnoredDirs = async (next: ScopedIgnoredDirNames) => {
        if (savingIgnored) return;
        setSavingIgnored(true);
        try {
            const saved = await libraryService.setScopedIgnoredDirNames(next);
            setIgnoredDirs(saved);
        } catch (e) {
            console.error(e);
            toast.error('保存忽略列表失败', { id: 'ignored-dirs' });
        } finally {
            setSavingIgnored(false);
        }
    };

    const setInput = (scope: IgnoreScope, value: string) => {
        setInputs((current) => ({ ...current, [scope]: value }));
    };

    const addIgnoredDir = (scope: IgnoreScope) => {
        const name = inputs[scope].trim();
        if (!name) return;

        const existsInTarget = ignoredDirs[scope].some((d) => d.toLowerCase() === name.toLowerCase());
        const existsInCommon = scope !== 'common' && ignoredDirs.common.some((d) => d.toLowerCase() === name.toLowerCase());
        if (existsInTarget || existsInCommon) {
            setInput(scope, '');
            return;
        }

        const next: ScopedIgnoredDirNames = {
            ...ignoredDirs,
            [scope]: [...ignoredDirs[scope], name],
        };

        if (scope === 'common') {
            next.music = next.music.filter((d) => d.toLowerCase() !== name.toLowerCase());
            next.video = next.video.filter((d) => d.toLowerCase() !== name.toLowerCase());
        }

        setInput(scope, '');
        persistIgnoredDirs(next);
    };

    const removeIgnoredDir = (scope: IgnoreScope, name: string) => {
        const next: ScopedIgnoredDirNames = {
            ...ignoredDirs,
            [scope]: ignoredDirs[scope].filter((d) => d !== name),
        };
        persistIgnoredDirs(next);
    };

    const renderScope = (scope: IgnoreScope) => {
        const config = SCOPE_CONFIG[scope];
        const dirs = ignoredDirs[scope];
        const input = inputs[scope];

        return (
            <div className="space-y-3">
                <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-on-surface">{config.title}</span>
                    <span className="text-xs text-on-surface-variant">{config.description}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {dirs.length === 0 && (
                        <span className="text-sm text-on-surface-variant/70">{config.emptyText}</span>
                    )}
                    {dirs.map((name) => (
                        <span
                            key={name}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary-container text-on-secondary-container text-sm"
                        >
                            {name}
                            <button
                                onClick={() => removeIgnoredDir(scope, name)}
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
                        value={input}
                        onChange={(e) => setInput(scope, e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addIgnoredDir(scope);
                            }
                        }}
                        placeholder={config.placeholder}
                        className="settings-control flex-1 px-3 py-2 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/60 border focus:outline-none focus:border-primary/50"
                    />
                    <button
                        onClick={() => addIgnoredDir(scope)}
                        disabled={!input.trim() || savingIgnored}
                        className={clsx(
                            "px-4 py-2 rounded-xl font-medium text-sm transition-all active:scale-95",
                            !input.trim() || savingIgnored
                                ? "settings-control text-on-surface-variant cursor-not-allowed"
                                : "bg-primary text-on-primary hover:shadow-md hover:brightness-110"
                        )}
                    >
                        添加
                    </button>
                </div>
            </div>
        );
    };

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                <MdBlockFlipped className="text-lg" />
                <span>扫描忽略目录</span>
            </div>

            <div className="settings-list flex flex-col gap-px rounded-2xl overflow-hidden">
                <div className="settings-static-row p-4">
                    <p className="text-sm text-on-surface-variant">
                        扫描时会跳过名称匹配以下任一项的目录（不区分大小写）。常用于排除项目目录里的非音乐内容。
                    </p>
                </div>
                <div className="settings-static-row p-4">
                    {renderScope('common')}
                </div>
                <div className="settings-static-row p-4">
                    {renderScope('music')}
                </div>
                <div className="settings-static-row p-4">
                    {renderScope('video')}
                </div>
            </div>
        </section>
    );
}
