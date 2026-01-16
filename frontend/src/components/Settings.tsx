import { useTheme } from '../hooks/useTheme';
import { VscColorMode } from 'react-icons/vsc';

export default function Settings() {
    const { theme, setTheme } = useTheme();

    const ThemeOption = ({ val, label }: { val: 'light' | 'dark' | 'system', label: string }) => (
        <button
            onClick={() => setTheme(val)}
            className={`
        flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all
        border border-neutral-200 dark:border-neutral-700
        ${theme === val
                    ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800'
                    : 'bg-white text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'}
      `}
        >
            <span>{label}</span>
            {theme === val && <div className="h-2 w-2 rounded-full bg-blue-500" />}
        </button>
    );

    return (
        <div className="mx-auto max-w-2xl p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="mb-6 text-3xl font-bold text-neutral-900 dark:text-neutral-50">设置</h2>

            <div className="space-y-6">
                {/* 外观设置组 */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-neutral-500">
                        <VscColorMode className="text-lg" />
                        <span>外观与主题</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <ThemeOption val="light" label="浅色模式" />
                        <ThemeOption val="dark" label="深色模式" />
                        <ThemeOption val="system" label="跟随系统" />
                    </div>
                </section>

                {/* 可以在这里添加更多设置，例如：音频输出设备、扫描路径等 */}
                <section className="rounded-xl bg-neutral-100 p-4 dark:bg-neutral-800/50">
                    <p className="text-xs text-neutral-500 text-center">
                        MD3 Player v0.1.0 (Alpha) <br />
                        Powered by Tauri v2 & React
                    </p>
                </section>
            </div>
        </div>
    );
}