import { useEffect, useState } from 'react';
import { getName, getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { FaGithub } from 'react-icons/fa';
import { MdCloudDownload, MdOpenInNew, MdRefresh } from 'react-icons/md';
import { toast } from 'react-hot-toast';

import logo from '@/assets/logo.png';
import { SettingsGroup, SettingsRow, SettingsSwitch } from '@/features/settings/components/SettingsControls';
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
            ? '前往下载'
            : '检查更新';
    const updateStatusText = {
        idle: '尚未检查更新',
        checking: '正在获取最新版本信息',
        'up-to-date': '当前已是最新版本',
        available: latestRelease ? `发现新版本 v${latestRelease.version}` : '发现新版本',
        error: '检查失败，请重试',
    }[status];

    return (
        <>
            <div className="flex flex-col items-center pb-2 pt-2 text-center">
                <img
                    src={logo}
                    alt=""
                    className="h-24 w-24 object-contain drop-shadow-md"
                />
                <h3 className="mt-4 text-xl font-semibold text-on-surface">
                    {appName || 'Simple Player'}
                </h3>
                <p className="mt-1 text-[13px] text-on-surface-variant">
                    版本 {appVersion || '—'}
                </p>
                <p className="mt-2 text-[13px] text-on-surface-variant">
                    专注本地音乐与视频播放的桌面播放器
                </p>
            </div>

            <SettingsGroup title="软件更新">
                <SettingsRow label="自动检查更新" description="应用启动时检查最新版本">
                    <SettingsSwitch
                        label="自动检查更新"
                        checked={autoCheckEnabled}
                        onChange={setAutoCheckEnabled}
                    />
                </SettingsRow>
                <SettingsRow
                    label="版本状态"
                    description={updateStatusText}
                >
                    <button
                        type="button"
                        disabled={status === 'checking'}
                        onClick={() => void handleUpdateAction()}
                        className={status === 'available'
                            ? "flex items-center gap-1.5 rounded-md bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container px-3 py-1 text-[13px] font-medium text-on-primary transition-transform hover:brightness-110 active:scale-[0.97]"
                            : "settings-control flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] font-medium text-on-surface transition-transform active:scale-[0.97] disabled:cursor-wait disabled:text-on-surface-variant"}
                    >
                        {status === 'checking'
                            ? <MdRefresh className="animate-spin text-base" />
                            : status === 'available'
                                ? <MdOpenInNew className="text-base" />
                                : <MdRefresh className="text-base" />}
                        {updateButtonText}
                    </button>
                </SettingsRow>
            </SettingsGroup>

            <SettingsGroup title="链接">
                <button
                    type="button"
                    aria-label="打开 GitHub 仓库"
                    onClick={() => void openExternal(GITHUB_URL)}
                    className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-on-surface/4"
                >
                    <FaGithub className="text-lg text-on-surface" />
                    <span className="flex-1 text-sm text-on-surface">GitHub 仓库</span>
                    <MdOpenInNew className="text-base text-on-surface-variant" />
                </button>
                <button
                    type="button"
                    aria-label="打开发布与下载页面"
                    onClick={() => void openExternal(RELEASES_URL)}
                    className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-on-surface/4"
                >
                    <MdCloudDownload className="text-lg text-on-surface" />
                    <span className="flex-1 text-sm text-on-surface">发布与下载</span>
                    <MdOpenInNew className="text-base text-on-surface-variant" />
                </button>
            </SettingsGroup>
        </>
    );
}
