import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-hot-toast';
import { MdSdStorage, MdDelete, MdMemory, MdVideoSettings } from 'react-icons/md';
import clsx from 'clsx';

interface TranscodeCacheInfo {
    total_size_mb: number;
    file_count: number;
    hw_accel_type: string;
    limit_mb: number;
}

export default function TranscodeSettings() {
    const [info, setInfo] = useState<TranscodeCacheInfo | null>(null);
    const [clearing, setClearing] = useState(false);
    const [limit, setLimit] = useState(5120); // Local state for slider
    const [saving, setSaving] = useState(false);

    const fetchInfo = async () => {
        try {
            const data = await invoke<TranscodeCacheInfo>('get_transcode_cache_info');
            setInfo(data);
            setLimit(data.limit_mb);
        } catch (error) {
            console.error('Failed to get transcode info:', error);
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
            toast.success(`已清理 ${deletedCount} 个缓存文件`);
        } catch (error) {
            console.error('Failed to clear cache:', error);
            toast.error('清理缓存失败');
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
            toast.success('缓存设置已保存');
        } catch (error) {
            console.error('Failed to set cache limit:', error);
            toast.error('保存设置失败');
        } finally {
            setSaving(false);
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

    if (!info) return null;

    const usagePercent = Math.min((info.total_size_mb / limit) * 100, 100);

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

                    {/* 使用量进度条 */}
                    <div className="space-y-1">
                        <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                            <div
                                className={clsx(
                                    "h-full rounded-full transition-all duration-500",
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
                    <div className="pt-2">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-medium text-on-surface-variant">
                                最大缓存占用
                            </label>
                            <span className="text-xs font-bold text-primary">
                                {(limit / 1024).toFixed(1)} GB
                            </span>
                        </div>
                        <input
                            type="range"
                            min="1024" // 1GB
                            max="51200" // 50GB
                            step="1024" // 1GB steps
                            value={limit}
                            onChange={handleLimitChange}
                            onMouseUp={handleLimitCommit}
                            onTouchEnd={handleLimitCommit}
                            className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <p className="mt-2 text-[10px] text-on-surface-variant/60 leading-tight">
                            当缓存超过限制时，最旧的视频将被自动删除。增加限制可以减少重复转码，但会占用更多磁盘空间。
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
