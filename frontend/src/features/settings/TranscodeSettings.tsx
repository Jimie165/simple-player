import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'react-hot-toast';
import { MdSdStorage, MdDelete, MdMemory, MdVideoSettings, MdFolderOpen, MdRestore } from 'react-icons/md';
import clsx from 'clsx';

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
        fetchInfo();
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

    const handleLimitChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
            if (!selected || typeof selected !== 'string') return;
            setChangingDir(true);
            const data = await invoke<TranscodeCacheInfo>('set_transcode_cache_dir', { cacheDir: selected });
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

    // 格式化硬件加速类型显示
    const getHwAccelLabel = (type: string) => {
        switch (type) {
            case 'nvenc': return 'NVIDIA NVENC';
            case 'qsv': return 'Intel QuickSync';
            case 'videotoolbox': return 'Apple VideoToolbox';
            case 'vaapi': return 'VA-API (Linux)';
            case 'software': return '软件编码 (CPU)';
            case 'none': return '软件编码 (CPU)';
            default: return type;
        }
    };

    if (!info) {
        return (
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                    <MdVideoSettings className="text-lg" />
                    <span>视频转码设置</span>
                </div>
                <div className="bg-surface-container-high rounded-2xl border border-outline-variant/30 p-5">
                    <p className="text-sm text-on-surface-variant">
                        {loadError ?? '正在加载转码缓存设置...'}
                    </p>
                </div>
            </section>
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
        <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                <MdVideoSettings className="text-lg" />
                <span>视频转码设置</span>
            </div>

            <div className="bg-surface-container-high rounded-2xl border border-outline-variant/30 p-5 space-y-6">

                {/* 硬件加速状态 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-secondary/10 text-secondary">
                            <MdMemory className="text-xl" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-on-surface">硬件加速</h4>
                            <p className="text-xs text-on-surface-variant">
                                当前使用: {getHwAccelLabel(info.hw_accel_type)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="h-px bg-outline-variant/20" />

                {/* 缓存管理 */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-primary/10 text-primary">
                                <MdSdStorage className="text-xl" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-on-surface">转码缓存</h4>
                                <p className="text-xs text-on-surface-variant">
                                    {info.file_count} 个文件 • 已用 {(info.total_size_mb / 1024).toFixed(2)} GB
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleClearCache}
                            disabled={clearing}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 border border-error/30 hover:bg-error/10 text-error",
                                clearing && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <MdDelete className={clsx("text-base", clearing && "animate-pulse")} />
                            {clearing ? '清理中...' : '清空缓存'}
                        </button>
                    </div>

                    <div className="flex items-start justify-between gap-3 rounded-xl bg-surface-container px-3 py-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-on-surface-variant mb-1">转码 MP4 文件夹</p>
                            <p className="text-sm text-on-surface truncate" title={info.cache_dir}>
                                {info.cache_dir}
                            </p>
                            <p className="mt-1 text-[10px] text-on-surface-variant/70">
                                {info.is_custom_cache_dir ? '自定义位置' : '默认位置'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {info.is_custom_cache_dir && (
                                <button
                                    onClick={handleResetCacheDir}
                                    disabled={changingDir}
                                    className="flex items-center justify-center w-9 h-9 rounded-full text-on-surface-variant hover:bg-surface-container-highest hover:text-primary transition-colors active:scale-95 disabled:opacity-50"
                                    title={`恢复默认文件夹：${info.default_cache_dir}`}
                                >
                                    <MdRestore className="text-lg" />
                                </button>
                            )}
                            <button
                                onClick={handleChooseCacheDir}
                                disabled={changingDir}
                                className="flex items-center justify-center w-9 h-9 rounded-full text-primary hover:bg-primary/10 transition-colors active:scale-95 disabled:opacity-50"
                                title="选择转码 MP4 文件夹"
                            >
                                <MdFolderOpen className="text-lg" />
                            </button>
                        </div>
                    </div>

                    {/* 使用量进度条 */}
                    <div className="space-y-1">
                        <div className="h-2 w-full bg-primary/20 rounded-full overflow-hidden">
                            <div
                                className={clsx(
                                    "h-full rounded-full transition-all duration-500 ease-out",
                                    usagePercent > 90 ? "bg-error" : "bg-primary"
                                )}
                                style={{ width: `${usagePercent}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[10px] text-on-surface-variant/70 uppercase font-medium">
                            <span>0 GB</span>
                            <span>限制: {(limit / 1024).toFixed(1)} GB</span>
                        </div>
                    </div>

                    {/* 限制滑块 */}
                    <div className="pt-2 pb-1">
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
                                className="absolute right-0 top-1/2 h-3 -translate-y-1/2 rounded-r-full bg-primary/20"
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
                                className="absolute top-1/2 h-9 w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-sm pointer-events-none"
                                style={{ left: `${limitPercent}%` }}
                            />

                            <input
                                type="range"
                                min={limitMin}
                                max={limitMax}
                                step={limitStep}
                                value={limit}
                                onChange={handleLimitChange}
                                onMouseUp={handleLimitCommit}
                                onTouchEnd={handleLimitCommit}
                                onBlur={handleLimitCommit}
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                        </div>

                        {/* Labels below slider */}
                        <div className="flex justify-between mt-1 text-[10px] font-medium text-primary">
                            <span>{(limitMin / 1024).toFixed(0)} GB</span>
                            <span>{(limitMax / 1024).toFixed(0)} GB</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
