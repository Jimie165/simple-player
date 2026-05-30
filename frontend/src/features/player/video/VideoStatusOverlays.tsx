import { motion } from 'framer-motion';

interface VideoStatusOverlaysProps {
    isBuffering: boolean;
    error: string | null;
    showError: boolean;
    isPreparing: boolean;
    preparePercent: number | null;
    metadata: { path?: string | null };
    onClose: () => void;
}

export function VideoStatusOverlays({
    isBuffering,
    error,
    showError,
    isPreparing,
    preparePercent,
    metadata,
    onClose,
}: VideoStatusOverlaysProps) {
    return (
        <>
            {isBuffering && !error && (
                <div className="col-start-1 row-start-1 w-full h-full z-40 flex items-center justify-center pointer-events-none">
                    <div className="w-16 h-16 border-4 border-white/20 border-t-red-600 rounded-full animate-spin duration-700"></div>
                </div>
            )}

            {isPreparing && (
                <div className="col-start-1 row-start-1 w-full h-full z-40 flex flex-col items-center justify-center bg-black/70 text-white pointer-events-none backdrop-blur-sm">
                    <div className="flex flex-col items-center max-w-sm w-full px-6">
                        <div className="text-lg font-medium mb-3 tracking-wide">正在准备播放</div>

                        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden mb-3 relative">
                            {preparePercent !== null ? (
                                <motion.div
                                    className="h-full bg-primary rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.max(0, Math.min(100, preparePercent))}%` }}
                                    transition={{ duration: 0.3 }}
                                />
                            ) : (
                                <motion.div
                                    className="h-full bg-primary/80 rounded-full w-1/3 absolute left-0"
                                    animate={{
                                        x: ["-100%", "300%"],
                                    }}
                                    transition={{
                                        duration: 1.5,
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    }}
                                />
                            )}
                        </div>

                        <div className="flex justify-end w-full text-white/70 text-xs font-medium">
                            <span>
                                {preparePercent !== null ? `${Math.round(preparePercent)}%` : ''}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {error && showError && (
                <div className="col-start-1 row-start-1 w-full h-full z-50 flex flex-col items-center justify-center bg-black/90 text-white pointer-events-auto">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <div className="text-xl font-bold mb-2">无法播放视频</div>
                    <div className="text-white/70 mb-6 px-8 text-center">{error}</div>
                    {metadata.path?.endsWith('.mkv') && (
                        <div className="text-yellow-400 text-sm bg-yellow-400/10 px-4 py-2 rounded-lg border border-yellow-400/20 mb-6">
                            提示：浏览器内核通常不支持原生播放 MKV 格式。
                        </div>
                    )}
                    {metadata.path?.toLowerCase().endsWith('.mp4') && (
                        <div className="text-yellow-400 text-sm bg-yellow-400/10 px-4 py-2 rounded-lg border border-yellow-400/20 mb-6">
                            提示：MP4 只是封装格式。如果使用了 HEVC/H.265 等编码，WebView 内核可能不支持，建议导出为 H.264/AVC + AAC。
                        </div>
                    )}
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                    >
                        关闭播放器
                    </button>
                </div>
            )}
        </>
    );
}
