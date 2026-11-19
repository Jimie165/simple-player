import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'react-hot-toast';
import { MdDelete, MdFolderOpen, MdRestore } from 'react-icons/md';
import clsx from 'clsx';
import { getSelectedPath } from '@/utils/dialogSelection';
import CustomTooltip from '@/components/common/CustomTooltip';
import { SettingsGroup, SettingsRow } from '@/features/settings/components/SettingsControls';
import { useRangePointerDrag } from '@/hooks/useRangePointerDrag';

interface TranscodeCacheInfo {
    total_size_mb: number;
    file_count: number;
    hw_accel_type: string;
    limit_mb: number;
    cache_dir: string;
    default_cache_dir: string;
    is_custom_cache_dir: boolean;
}

export default function TranscodeSettings() {
    const [info, setInfo] = useState<TranscodeCacheInfo | null>(null);
    const [clearing, setClearing] = useState(false);
    const [limit, setLimit] = useState(5120); // Local state for slider
    const [saving, setSaving] = useState(false);
    const [changingDir, setChangingDir] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const fetchInfo = async () => {
        try {
            const data = await invoke<TranscodeCacheInfo>('get_transcode_cache_info');
            setInfo(data);
            setLimit(data.limit_mb);
            setLoadError(null);
        } catch (error) {
            console.error('Failed to get transcode info:', error);
            setLoadError(typeof error === 'string' ? error : '无法加载转码缓存设置');
        }
    };

    useEffect(() => {
        let cancelled = false;
        let unlisten: (() => void) | undefined;

        const load = async () => {
            try {
                const data = await invoke<TranscodeCacheInfo>('get_transcode_cache_info');
                if (cancelled) return;
                setInfo(data);
                setLimit(data.limit_mb);
                setLoadError(null);
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to get transcode info:', error);
                    setLoadError(typeof error === 'string' ? error : '无法加载转码缓存设置');
                }
            }
        };

        const subscribe = async () => {
            // 先订阅再请求状态，避免后台检测完成的事件落在两者之间。
            const unlistenFn = await listen('hardware-encoder-detected', () => {
                void load();
            });

            if (cancelled) {
                unlistenFn();
                return;
            }

            unlisten = unlistenFn;
            await load();
        };

        void subscribe();
        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, []);

    const handleClearCache = async () => {
        if (clearing) return;
        setClearing(true);
        try {
            const deletedCount = await invoke<number>('clear_transcode_cache');
            console.log(`已清理 ${deletedCount} 个缓存文件`);
            await fetchInfo(); // Refresh stats
            toast.success(`已清理 ${deletedCount} 个缓存文件`, { id: 'clear-cache-toast' });
        } catch (error) {
            console.error('Failed to clear cache:', error);
            toast.error('清理缓存失败', { id: 'clear-cache-toast' });
        } finally {
            setClearing(false);
        }
    };

    const handleLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        setLimit(val);
    };

    const handleLimitCommit = async () => {
        if (saving || (info && limit === info.limit_mb)) return;
        setSaving(true);
        try {
            await invoke('set_transcode_cache_limit', { limitMb: limit });
            await fetchInfo();
            toast.success('缓存设置已保存', { id: 'save-cache-limit-toast' });
        } catch (error) {
            console.error('Failed to set cache limit:', error);
            toast.error('保存设置失败', { id: 'save-cache-limit-toast' });
        } finally {
            setSaving(false);
        }
    };

    const handleChooseCacheDir = async () => {
        if (changingDir) return;
        try {
            const selected = await open({ directory: true, multiple: false });
            const cacheDir = getSelectedPath(selected);
            if (!cacheDir) return;
            setChangingDir(true);
            const data = await invoke<TranscodeCacheInfo>('set_transcode_cache_dir', { cacheDir });
            setInfo(data);
            setLimit(data.limit_mb);
            toast.success('转码 MP4 文件夹已更新', { id: 'cache-dir-toast' });
        } catch (error) {
            console.error('Failed to set cache dir:', error);
            toast.error(typeof error === 'string' ? error : '更新转码 MP4 文件夹失败', { id: 'cache-dir-toast' });
        } finally {
            setChangingDir(false);
        }
    };

    const handleResetCacheDir = async () => {
        if (changingDir || !info?.is_custom_cache_dir) return;
        setChangingDir(true);
        try {
            const data = await invoke<TranscodeCacheInfo>('set_transcode_cache_dir', { cacheDir: null });
            setInfo(data);
            setLimit(data.limit_mb);
            toast.success('已恢复默认转码 MP4 文件夹', { id: 'cache-dir-toast' });
        } catch (error) {
            console.error('Failed to reset cache dir:', error);
            toast.error('恢复默认文件夹失败', { id: 'cache-dir-toast' });
        } finally {
            setChangingDir(false);
        }
    };

    const limitPointerDrag = useRangePointerDrag(undefined, () => { void handleLimitCommit().catch(console.error); });

    // 格式化硬件加速类型显示
    const getHwAccelLabel = (type: string) => {
        switch (type) {
            case 'nvenc': return 'NVIDIA NVENC';
            case 'qsv': return 'Intel QuickSync';
            case 'videotoolbox': return 'Apple VideoToolbox';
            case 'vaapi': return 'VA-API (Linux)';
            case 'software': return '软件编码 (CPU)';
            case 'none': return '软件编码 (CPU)';
            case 'detecting': return '正在检测…';
            default: return type;
        }
    };

    if (!info) {
        return (
            <SettingsGroup title="视频转码">
                <p className="px-3.5 py-3 text-sm text-on-surface-variant">
                    {loadError ?? '正在加载转码缓存设置...'}
                </p>
            </SettingsGroup>
        );
    }

    const usagePercent = Math.min((info.total_size_mb / limit) * 100, 100);
    const limitMin = 1024; // 1GB
    const limitMax = 51200; // 50GB
    const limitStep = 1024; // 1GB steps
    const limitPercent = Math.min(
        Math.max(((limit - limitMin) / (limitMax - limitMin)) * 100, 0),
        100
    );

    return (
        <>
            <SettingsGroup title="视频转码">
                {/* 硬件加速状态 */}
                <SettingsRow label="硬件加速">
                    <span className="text-[13px] text-on-surface-variant">
                        {getHwAccelLabel(info.hw_accel_type)}
                    </span>
                </SettingsRow>
            </SettingsGroup>

            <SettingsGroup title="转码缓存">
                {/* 使用量 */}
                <div className="space-y-2 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-on-surface">已用空间</span>
                        <span className="text-[13px] tabular-nums text-on-surface-variant">
                            {(info.total_size_mb / 1024).toFixed(2)} GB / {(limit / 1024).toFixed(1)} GB · {info.file_count} 个文件
                        </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-on-surface/10">
                        <div
                            className={clsx(
                                "h-full rounded-full transition-all duration-500 ease-out",
                                usagePercent > 90 ? "bg-error" : "bg-primary"
                            )}
                            style={{ width: `${usagePercent}%` }}
                        />
                    </div>
                </div>

                {/* 限制滑块 */}
                <div className="pt-2 pb-1 px-3.5">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-xs font-medium text-on-surface-variant">
                            最大缓存占用
                        </label>
                        <span className="text-xs font-bold text-primary">
                            {(limit / 1024).toFixed(1)} GB
                        </span>
                    </div>

                    <div className="relative h-7 w-full group flex items-center">
                        {/* Track Background (Right side - Empty part) */}
                        <div
                            className="absolute right-0 top-1/2 h-3 -translate-y-1/2 rounded-r-full bg-on-surface/10"
                            style={{
                                left: `calc(${limitPercent}% + 6px)`,
                                right: 0
                            }}
                        />

                        {/* Track Foreground (Left side - Filled part) */}
                        <div
                            className="absolute left-0 top-1/2 h-3 -translate-y-1/2 rounded-l-full bg-primary"
                            style={{
                                width: `calc(${limitPercent}% - 6px)`
                            }}
                        />

                        {/* Thumb (Vertical Line) */}
                        <div
                            className="absolute top-1/2 h-9 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-sm pointer-events-none"
                            style={{ left: `${limitPercent}%` }}
                        />

                        <input
                            type="range"
                            min={limitMin}
                            max={limitMax}
                            step={limitStep}
                            value={limit}
                            onChange={handleLimitChange}
                            {...limitPointerDrag}
                            onBlur={() => { void handleLimitCommit().catch(console.error); }}
                            aria-label="最大缓存占用"
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 touch-none"
                        />
                    </div>

                    {/* Labels below slider */}
                    <div className="flex justify-between mt-1 text-[10px] font-medium text-primary">
                        <span>{(limitMin / 1024).toFixed(0)} GB</span>
                        <span>{(limitMax / 1024).toFixed(0)} GB</span>
                    </div>
                </div>

                {/* 转码 MP4 文件夹 */}
                <SettingsRow
                    label="转码 MP4 文件夹"
                    description={
                        <CustomTooltip text={info.cache_dir} className="block min-w-0">
                            <span className="block truncate">
                                {info.is_custom_cache_dir ? '自定义：' : '默认：'}{info.cache_dir}
                            </span>
                        </CustomTooltip>
                    }
                >
                    {info.is_custom_cache_dir && (
                        <CustomTooltip text={`恢复默认文件夹：${info.default_cache_dir}`} disabled={changingDir}>
                            <button
                                onClick={() => { void handleResetCacheDir().catch(console.error); }}
                                disabled={changingDir}
                                aria-label="恢复默认转码 MP4 文件夹"
                                className="settings-control flex h-7 w-7 items-center justify-center rounded-md text-on-surface-variant transition-transform active:scale-95 disabled:opacity-50"
                            >
                                <MdRestore className="text-base" />
                            </button>
                        </CustomTooltip>
                    )}
                    <button
                        onClick={() => { void handleChooseCacheDir().catch(console.error); }}
                        disabled={changingDir}
                        aria-label="选择转码 MP4 文件夹"
                        className="settings-control flex items-center gap-1 rounded-md px-3 py-1 text-[13px] font-medium text-on-surface transition-transform active:scale-[0.97] disabled:opacity-50"
                    >
                        <MdFolderOpen className="text-base" />
                        选择…
                    </button>
                </SettingsRow>

                <SettingsRow label="清空转码缓存" description="删除所有已转码的视频文件">
                    <button
                        onClick={() => { void handleClearCache().catch(console.error); }}
                        disabled={clearing}
                        className={clsx(
                            "settings-control flex items-center gap-1 rounded-md px-3 py-1 text-[13px] font-medium text-error transition-transform active:scale-[0.97]",
                            clearing && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <MdDelete className={clsx("text-base", clearing && "animate-pulse")} />
                        {clearing ? '清理中…' : '清空缓存'}
                    </button>
                </SettingsRow>
            </SettingsGroup>
        </>
    );
}
