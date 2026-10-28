import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { MdClose } from 'react-icons/md';
import clsx from 'clsx';

import { libraryService, type ScopedIgnoredDirNames } from '@/services/libraryService';
import CustomTooltip from '@/components/common/CustomTooltip';
import { SettingsGroup } from '@/features/settings/components/SettingsControls';

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
        void (persistIgnoredDirs(next)).catch(console.error);
    };

    const removeIgnoredDir = (scope: IgnoreScope, name: string) => {
        const next: ScopedIgnoredDirNames = {
            ...ignoredDirs,
            [scope]: ignoredDirs[scope].filter((d) => d !== name),
        };
        void (persistIgnoredDirs(next)).catch(console.error);
    };

    const renderScope = (scope: IgnoreScope) => {
        const config = SCOPE_CONFIG[scope];
        const dirs = ignoredDirs[scope];
        const input = inputs[scope];

        return (
            <div className="space-y-2.5 px-3.5 py-3">
                <div>
                    <div className="text-sm text-on-surface">{config.title}</div>
                    <div className="mt-0.5 text-xs text-on-surface-variant">{config.description}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {dirs.length === 0 && (
                        <span className="text-xs text-on-surface-variant/70">{config.emptyText}</span>
                    )}
                    {dirs.map((name) => (
                        <div
                            key={name}
                            className="settings-subtle inline-flex items-center gap-1 rounded-md py-0.5 pl-2 pr-1 text-[13px] text-on-surface"
                        >
                            {name}
                            <CustomTooltip text="移除">
                                <button
                                    onClick={() => removeIgnoredDir(scope, name)}
                                    aria-label={`移除 ${name}`}
                                    className="flex h-4 w-4 items-center justify-center rounded-full text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface active:scale-90"
                                >
                                    <MdClose className="text-xs" />
                                </button>
                            </CustomTooltip>
                        </div>
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
                        className="settings-control flex-1 rounded-md px-2.5 py-1 text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                        onClick={() => addIgnoredDir(scope)}
                        disabled={!input.trim() || savingIgnored}
                        className={clsx(
                            "rounded-md px-3 py-1 text-[13px] font-medium transition-transform active:scale-[0.97]",
                            !input.trim() || savingIgnored
                                ? "settings-control cursor-not-allowed text-on-surface-variant"
                                : "bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container text-on-primary hover:brightness-110"
                        )}
                    >
                        添加
                    </button>
                </div>
            </div>
        );
    };

    return (
        <SettingsGroup
            title="扫描忽略目录"
            footer="扫描时会跳过名称匹配以下任一项的目录（不区分大小写）。常用于排除项目目录里的非音乐内容。"
        >
            {renderScope('common')}
            {renderScope('music')}
            {renderScope('video')}
        </SettingsGroup>
    );
}
