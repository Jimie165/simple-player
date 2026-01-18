import PageContainer from '../../components/layout/PageContainer';
import { useTheme } from '../../hooks/useTheme';
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
                    ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800 ring-1 ring-blue-500/20'
                    : 'bg-white text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'}
      `}
        >
            <span>{label}</span>
            {theme === val && <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
        </button>
    );

    return (
        // 使用 PageContainer，标题直接传 "设置"
        <PageContainer title="设置">
            <div className="max-w-2xl space-y-8">

                {/* 外观设置组 */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                        <VscColorMode className="text-lg" />
                        <span>外观与主题</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <ThemeOption val="light" label="浅色模式" />
                        <ThemeOption val="dark" label="深色模式" />
                        <ThemeOption val="system" label="跟随系统" />
                    </div>
                </section>

                {/* 关于信息 */}
                <section className="rounded-2xl bg-neutral-100 p-6 dark:bg-neutral-800/50 border border-neutral-200/50 dark:border-neutral-700/50">
                    <h3 className="text-lg font-semibold mb-2">关于 Simple Player</h3>
                    <p className="text-sm text-neutral-500 leading-relaxed">
                        这是一个基于 Tauri v2 和 React 构建的高性能本地音乐播放器，遵循 Material Design 3 设计规范。
                    </p>
                    <div className="mt-4 flex gap-4 text-xs text-neutral-400">
                        <span>Version 0.1.0 (Alpha)</span>
                        <span>•</span>
                        <span>Made with ❤️ by You</span>
                    </div>
                </section>
            </div>
        </PageContainer>
    );
}