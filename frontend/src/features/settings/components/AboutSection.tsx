import { useEffect, useState } from 'react';
import { getName, getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import clsx from 'clsx';
import { FaGithub } from 'react-icons/fa';
import { MdCloudDownload, MdInfoOutline, MdOpenInNew, MdRefresh } from 'react-icons/md';
import { toast } from 'react-hot-toast';

import logo from '@/assets/logo.png';
import CustomTooltip from '@/components/common/CustomTooltip';
import { useUpdateStore } from '@/store/useUpdateStore';

const GITHUB_URL = 'https://github.com/Jimie165/simple-player';
const RELEASES_URL = `${GITHUB_URL}/releases`;

export default function AboutSection() {
    const [appVersion, setAppVersion] = useState('');
    const [appName, setAppName] = useState('');
    const autoCheckEnabled = useUpdateStore(state => state.autoCheckEnabled);
    const setAutoCheckEnabled = useUpdateStore(state => state.setAutoCheckEnabled);
    const status = useUpdateStore(state => state.status);
    const latestRelease = useUpdateStore(state => state.latestRelease);
    const checkForUpdates = useUpdateStore(state => state.checkForUpdates);

    useEffect(() => {
        void Promise.all([getName(), getVersion()])
            .then(([name, version]) => {
                setAppName(name);
                setAppVersion(version);
            })
            .catch(error => {
                console.error('Failed to get app info', error);
            });
    }, []);

    const openExternal = async (url: string) => {
        try {
            await open(url);
        } catch (error) {
            console.error('Failed to open external URL', error);
            toast.error('无法打开外部链接');
        }
    };

    const handleUpdateAction = async () => {
        if (status === 'available' && latestRelease) {
            await openExternal(latestRelease.url);
            return;
        }

        try {
            const result = await checkForUpdates();
            if (result.updateAvailable) {
                toast.success(`发现新版本 v${result.latestRelease.version}`);
            } else {
                toast.success('当前已是最新版本');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : '检查更新失败';
            toast.error(message);
        }
    };

    const updateButtonText = status === 'checking'
        ? '正在检查...'
        : status === 'available' && latestRelease
            ? `前往下载 v${latestRelease.version}`
            : '检查更新';

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2 px-1 text-sm font-semibold uppercase tracking-wider text-primary">
                <MdInfoOutline className="text-lg" />
                <span>关于</span>
            </div>

            <div className="settings-card overflow-hidden rounded-2xl">
                <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
                    <img
                        src={logo}
                        alt=""
                        className="h-28 w-28 object-contain"
                    />
                    <h3 className="mt-5 text-xl font-bold text-on-surface">
                        {appName || 'Simple Player'}
                    </h3>
                    <span className="mt-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                        v{appVersion || '—'}
                    </span>
                    <p className="mt-3 text-sm text-on-surface-variant">
                        专注本地音乐与视频播放的桌面播放器
                    </p>

                    <div className="mt-5 flex items-center justify-center gap-3">
                        <CustomTooltip text="GitHub 仓库">
                            <button
                                type="button"
                                aria-label="打开 GitHub 仓库"
                                onClick={() => void openExternal(GITHUB_URL)}
                                className="settings-subtle grid h-12 w-12 place-items-center rounded-full text-xl text-on-surface-variant transition-all hover:bg-primary/10 hover:text-primary active:scale-95"
                            >
                                <FaGithub />
                            </button>
                        </CustomTooltip>
                        <CustomTooltip text="发布与下载">
                            <button
                                type="button"
                                aria-label="打开发布与下载页面"
                                onClick={() => void openExternal(RELEASES_URL)}
                                className="settings-subtle grid h-12 w-12 place-items-center rounded-full text-xl text-on-surface-variant transition-all hover:bg-primary/10 hover:text-primary active:scale-95"
                            >
                                <MdCloudDownload />
                            </button>
                        </CustomTooltip>
                    </div>
                </div>

                <div className="border-t border-outline-variant/20 bg-surface-container/30 p-4">
                    <div className="settings-subtle flex items-center justify-between gap-4 rounded-2xl px-4 py-3">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-on-surface">自动检查更新</p>
                            <p className="mt-0.5 text-xs text-on-surface-variant">应用启动时检查最新版本</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-label="自动检查更新"
                            aria-checked={autoCheckEnabled}
                            onClick={() => setAutoCheckEnabled(!autoCheckEnabled)}
                            className="-mr-2 flex shrink-0 items-center justify-center rounded-full p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <span
                                className={clsx(
                                    'relative block h-6 w-11 rounded-full transition-colors',
                                    autoCheckEnabled ? 'bg-primary' : 'bg-outline-variant/50'
                                )}
                            >
                                <span
                                    className={clsx(
                                        'absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                                        autoCheckEnabled ? 'translate-x-5' : 'translate-x-0'
                                    )}
                                />
                            </span>
                        </button>
                    </div>

                    <button
                        type="button"
                        disabled={status === 'checking'}
                        onClick={() => void handleUpdateAction()}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-on-primary shadow-sm transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
                    >
                        {status === 'checking'
                            ? <MdRefresh className="animate-spin text-lg" />
                            : status === 'available'
                                ? <MdOpenInNew className="text-lg" />
                                : <MdRefresh className="text-lg" />}
                        {updateButtonText}
                    </button>
                </div>
            </div>
        </section>
    );
}
