import { useState, useEffect } from 'react';
import { useTheme } from './hooks/useTheme';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import PlayerControl from './components/PlayerControl';
import MusicGrid from './components/MusicGrid';
import Library from './components/Library';
import Settings from './components/Settings';
import NowPlayingView from './components/NowPlayingView'; // 引入新组件
import type { SongMetadata } from './types';

type PageId = 'home' | 'library' | 'videos' | 'queue' | 'playlists' | 'settings';

function App() {
  useTheme();

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [history, setHistory] = useState<PageId[]>([]);

  // 播放状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMetadata, setCurrentMetadata] = useState<SongMetadata | null>(null);

  // 新增：沉浸模式状态
  const [isFullScreen, setIsFullScreen] = useState(false);

  const handleNavigate = (page: string) => {
    const target = page as PageId;
    if (target === currentPage) return;
    setHistory((prev) => [...prev, currentPage]);
    setCurrentPage(target);
    // 如果在沉浸模式下切换页面，自动退出沉浸模式
    if (isFullScreen) setIsFullScreen(false);
  };

  const handleBack = () => {
    // 如果在沉浸模式下按后退，优先退出沉浸模式
    if (isFullScreen) {
      setIsFullScreen(false);
      return;
    }
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
      case 'home': return <MusicGrid onPlay={() => setIsPlaying(true)} setMetadata={setCurrentMetadata} />;
      case 'library': return <Library />;
      case 'settings': return <Settings />;
      default: return null;
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F3F3F3] dark:bg-[#202020] text-neutral-900 dark:text-neutral-50 font-sans">

      {/* 1. 标题栏 */}
      <TitleBar />

      <div className="flex flex-1 overflow-hidden relative">

        {/* 2. 左侧：侧边栏 (仅在非全屏模式下显示) */}
        {!isFullScreen && (
          <Sidebar
            activeId={currentPage}
            onNavigate={handleNavigate}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            canGoBack={history.length > 0}
            onBack={handleBack}
          />
        )}

        {/* 3. 右侧区域 */}
        {/* 这里分两种情况：正常模式 和 全屏模式 */}

        {isFullScreen ? (
          // --- 沉浸模式视图 ---
          // 占据整个 flex-1 区域
          <NowPlayingView metadata={currentMetadata} />
        ) : (
          // --- 正常模式视图 ---
          <div className="flex flex-1 flex-col min-w-0 bg-white dark:bg-[#272727] rounded-tl-xl border-l border-t border-neutral-200/50 dark:border-neutral-700/30 overflow-hidden shadow-sm relative">
            {/* 标题栏占位背景 */}
            <div data-tauri-drag-region className="h-10 w-full shrink-0 bg-white dark:bg-[#272727] transition-colors z-10" />
            {/* 滚动内容 */}
            <main className="flex-1 overflow-y-auto scroll-smooth relative">
              {renderContent()}
            </main>
          </div>
        )}
      </div>

      {/* 4. 底部播放控制 */}
      <PlayerControl
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        metadata={currentMetadata}
        isFullScreen={isFullScreen}
        toggleFullScreen={() => setIsFullScreen(!isFullScreen)} // 传递切换函数
      />
    </div>
  );
}

export default App;