import { useState } from 'react';
import { useTheme } from './hooks/useTheme';
import TitleBar from './components/TitleBar'; // 这里的 TitleBar 只负责按钮逻辑，不负责布局占位
import Sidebar from './components/Sidebar';
import PlayerControl from './components/PlayerControl';
import MusicGrid from './components/MusicGrid';
import Library from './components/Library';
import Settings from './components/Settings';

import type { SongMetadata } from './types';

type PageId = 'home' | 'library' | 'videos' | 'queue' | 'playlists' | 'settings';

function App() {
  useTheme();

  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const [isPlaying, setIsPlaying] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [history, setHistory] = useState<PageId[]>([]);
  const [currentMetadata, setCurrentMetadata] = useState<SongMetadata | null>(null);

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
      case 'home':
        return <MusicGrid
          onPlay={() => setIsPlaying(true)}
          setMetadata={setCurrentMetadata}
        />;
      case 'library': return <Library />;
      case 'settings': return <Settings />;
      default: return null;
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F3F3F3] dark:bg-[#202020] text-neutral-900 dark:text-neutral-50 font-sans selection:bg-blue-500/30">

      {/* 1. 系统控制按钮层 (最小化/关闭) 
         它绝对定位在最右上角，覆盖在所有层之上，确保永远可点击
      */}
      <TitleBar />

      <div className="flex flex-1 overflow-hidden relative">

        {/* 2. 左侧：侧边栏 (通顶)
          它直接占满左侧高度，不受标题栏影响。
        */}
        <Sidebar
          activeId={currentPage}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          canGoBack={history.length > 0}
          onBack={handleBack}
        />

        {/* 3. 右侧：垂直布局容器
          包含：顶部的拖拽条 + 下面的内容区
        */}
        <div className="flex flex-1 flex-col min-w-0 bg-white dark:bg-[#272727] rounded-tl-xl border-l border-t border-neutral-200/50 dark:border-neutral-700/30 overflow-hidden shadow-sm relative">

          {/* 【关键修改】右侧标题栏背景层 (40px)
             1. bg-white: 也就是你要求的“保留白色”，不透明。
             2. data-tauri-drag-region: 允许拖拽窗口。
             3. z-10: 确保它盖在滚动内容上面（虽然这里是 flex 布局，不会重叠）。
          */}
          <div
            data-tauri-drag-region
            className="h-10 w-full shrink-0 bg-white dark:bg-[#272727] border-b border-transparent transition-colors z-10"
          />

          {/* 【关键修改】真正的内容滚动区
             1. flex-1: 占据剩余高度。
             2. overflow-y-auto: 滚动条只出现在这里！不会通到顶部。
          */}
          <main className="flex-1 overflow-y-auto scroll-smooth relative">
            {renderContent()}
          </main>

        </div>
      </div>

      <PlayerControl
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        metadata={currentMetadata}
      />
    </div>
  );
}

export default App;