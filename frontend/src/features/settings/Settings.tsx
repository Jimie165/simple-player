import { useState, useEffect } from 'react';
import PageContainer from '@/components/layout/PageContainer';
import { useTheme } from '@/hooks/useTheme';
import { libraryService } from '@/services/libraryService';
import {
    MdBrightness6,
    MdRefresh,
    MdColorLens,
    MdCheck,
    MdAdd,
    MdLibraryMusic,
    MdWeb
} from 'react-icons/md';
import clsx from 'clsx';
import TranscodeSettings from './TranscodeSettings';
import { getName, getVersion } from '@tauri-apps/api/app';

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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

                    {/* Left Column: General & Appearance */}
                    <div className="space-y-6">
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
                    </div>

                    {/* Right Column: Transcode Settings & About */}
                    <div className="space-y-6">
                        <TranscodeSettings />

                        {/* About Info */}
                        <section className="rounded-2xl bg-surface-container-high p-6 border border-outline-variant/30">
                            <h3 className="text-lg font-semibold mb-2 text-on-surface">关于 {appName || 'Simple Player'}</h3>
                            <p className="text-sm text-on-surface-variant leading-relaxed">
                                这是一个基于 Tauri v2 和 React 构建的本地音乐播放器。
                            </p>
                            <div className="mt-4 flex gap-4 text-xs text-on-surface-variant/70">
                                <span>Version: {appVersion || '0.1.0'}</span>
                                <span>•</span>
                                <span>Made by Jimie165</span>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
