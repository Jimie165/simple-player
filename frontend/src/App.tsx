import { useState, useEffect } from 'react';
import { useTheme } from './hooks/useTheme';
import clsx from 'clsx';
import { useNavigationStore } from './store/useNavigationStore';

import TitleBar from './components/layout/TitleBar';
import Sidebar from './components/layout/Sidebar';

import MusicGrid from './features/home/MusicGrid';
import Library from './features/library/Library';
import Settings from './features/settings/Settings';
import NowPlayingView from './features/player/NowPlayingView';
import PlayerControl from './features/player/PlayerControl';

import { usePlayerStore } from './store/usePlayerStore';
import type { PageId } from './types/index';
import SearchResultsView from './features/search/SearchResultsView';
import PlaylistsRoot from './features/playlists/PlaylistsRoot';
import { useQueuePersistence } from './hooks/useQueuePersistence';

function App() {
  useTheme();
  const { canGoBack: isStoreCanGoBack, pop: storePop } = useNavigationStore();

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [history, setHistory] = useState<PageId[]>([]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useQueuePersistence(); // Activate queue persistence

  const metadata = usePlayerStore((state) => state.metadata);

  const handleNavigate = (page: string) => {
    const target = page as PageId;
    if (target === currentPage) return;

    // Fix: When returning to Library, user wants to reset to the top-level tab interface
    // (clearing any Detail views), but keeping the tab history logic is handled by Store.
    // clearSubviews() will reset to the last active Library Tab state.
    if (target === 'library') {
      useNavigationStore.getState().clearSubviews();
    }

    setHistory((prev) => [...prev, currentPage]);
    setCurrentPage(target);
    if (isFullScreen) setIsFullScreen(false);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    handleNavigate('search');
  };

  const handleBack = () => {
    if (isFullScreen) {
      setIsFullScreen(false);
      return;
    }

    // Priority 1: Library Internal Navigation (Store)
    if (isStoreCanGoBack) {
      storePop();
      return;
    }

    // Priority 2: App Page History
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
      case 'library': return <Library />;
      case 'settings': return <Settings />;
      case 'search': return <SearchResultsView query={searchQuery} />;
      case 'playlists': return <PlaylistsRoot />;
      default: return null;
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F3F3F3] dark:bg-[#202020] text-neutral-900 dark:text-neutral-50 font-sans">

      {/* 1. 标题栏 (始终在最顶层 z-[100]) */}
      <TitleBar />

      <div className="flex flex-1 overflow-hidden relative">

        {/* --- 层级 1: 正常布局 (侧边栏 + 主内容) --- */}
        <div className="absolute inset-0 flex z-0">
          <Sidebar
            activeId={currentPage}
            onNavigate={handleNavigate}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            canGoBack={history.length > 0 || isStoreCanGoBack}
            onBack={handleBack}
            onSearch={handleSearch}
          />

          <div className="flex flex-1 flex-col min-w-0 bg-white dark:bg-[#272727] rounded-tl-xl border-l border-t border-neutral-200/50 dark:border-neutral-700/30 overflow-hidden shadow-sm relative">
            <div data-tauri-drag-region className="h-8 w-full shrink-0 bg-white dark:bg-[#272727] transition-colors z-10" />
            <main className="flex-1 overflow-y-auto scroll-smooth relative">
              {renderContent()}
            </main>
          </div>
        </div>

        {/* --- 层级 2: 沉浸模式 (覆盖层) --- */}
        <div className={clsx(
          "absolute inset-0 z-40 transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
          isFullScreen
            ? "opacity-100 visible translate-y-0"
            : "opacity-0 invisible translate-y-4 pointer-events-none"
        )}>
          <NowPlayingView metadata={metadata} />
        </div>

      </div>

      {/* 4. 底部播放控制 */}
      <PlayerControl
        isFullScreen={isFullScreen}
        toggleFullScreen={() => setIsFullScreen(!isFullScreen)}
      />
    </div>
  );
}

export default App;