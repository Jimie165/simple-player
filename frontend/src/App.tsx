import { useState } from 'react';
import { useTheme } from './hooks/useTheme';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import PlayerControl from './components/PlayerControl';
import MusicGrid from './components/MusicGrid';
import Settings from './components/Settings';

type PageId = 'home' | 'library' | 'videos' | 'queue' | 'playlists' | 'settings';

function App() {
  useTheme(); // 确保主题加载

  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [history, setHistory] = useState<PageId[]>([]);

  const handleNavigate = (page: string) => {
    const target = page as PageId;
    if (target === currentPage) return;
    setHistory((prev) => [...prev, currentPage]);
    setCurrentPage(target);
  };

  const handleBack = () => {
    if (history.length === 0) return;
    const newHistory = [...history];
    const prevPage = newHistory.pop();
    if (prevPage) {
      setHistory(newHistory);
      setCurrentPage(prevPage);
    }
  };

  const renderContent = () => {
    switch (currentPage) {
      case 'home': return <MusicGrid />;
      case 'settings': return <Settings />;
      default: return (
        <div className="flex h-full items-center justify-center text-neutral-400">
          页面 {currentPage} 开发中
        </div>
      );
    }
  };

  return (
    // 背景色设置为深色模式下的标准背景
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F3F3F3] dark:bg-[#202020] text-neutral-900 dark:text-neutral-50 font-sans">

      {/* 1. 标题栏 (绝对定位，不占据流式布局空间) */}
      <TitleBar />

      {/* 2. 中间主要区域 */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* 左侧：Sidebar 
            注意：Sidebar 内部已经加了 pt-10 来避开 TitleBar
        */}
        <Sidebar
          activeId={currentPage}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          canGoBack={history.length > 0}
          onBack={handleBack}
        />

        {/* 右侧：主内容区 
            仿照 Win11：
            - 左上角大圆角 (rounded-tl-xl)
            - 背景色比 Sidebar 稍亮或稍暗 (这里用 #272727)
            - 只有内容区上方需要留出 TitleBar 的高度 (pt-10)
        */}
        <main className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-[#272727] rounded-tl-xl border-l border-t border-neutral-200/50 dark:border-neutral-700/30 shadow-sm pt-10 transition-all duration-300">
          <div className="flex-1 overflow-y-auto scroll-smooth p-6">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* 3. 底部播放栏 */}
      <PlayerControl />

    </div>
  );
}

export default App;