import { motion, AnimatePresence } from 'framer-motion';

export function BlurredCoverBackground({ src }: { src: string | null }) {
    return (
        <AnimatePresence mode="popLayout">
            {src && (
                <motion.div
                    key={src}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.9, ease: "easeInOut" }}
                    className="absolute inset-0 w-full h-full opacity-85 dark:opacity-70"
                >
                    {/* 最底层弥补空白边缘的大号模糊背景 */}
                    <div className="absolute inset-[-10%]">
                        <img
                            src={src}
                            alt=""
                            className="w-full h-full object-cover scale-[1.15] blur-[100px] saturate-[1.25] opacity-80"
                        />
                    </div>
                    {/* 原始底层景深 */}
                    <div className="absolute inset-[-10%]">
                        <img
                            src={src}
                            alt=""
                            className="w-full h-full object-cover scale-[1.08] blur-[58px] saturate-[1.15] contrast-[0.98] opacity-45"
                        />
                    </div>
                    <div className="absolute inset-[-4%] flex items-center justify-center overflow-hidden">
                        <img
                            src={src}
                            alt=""
                            className="w-full h-full object-contain scale-[1.08] blur-[78px] saturate-[1.45] contrast-[1.04]"
                        />
                    </div>
                    <div className="absolute inset-0 bg-black/15 dark:bg-black/12" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_48%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_48%)]" />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
