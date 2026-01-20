import { useState, useEffect } from 'react';
import { useTheme } from './hooks/useTheme';
import clsx from 'clsx';
import { useNavigationStore } from './store/useNavigationStore';
import { useSelectionStore } from './store/useSelectionStore';

import TitleBar from './components/layout/TitleBar';
import Sidebar from './components/layout/Sidebar';
import GlobalDetailStack from './components/layout/GlobalDetailStack';

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
import SelectionActionBar from './features/selection/SelectionActionBar';

function App() {
  useTheme();
  const { hasOverlay, pop: storePop } = useNavigationStore();

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
  const [isCompactSidebar, setIsCompactSidebar] = useState(() => window.innerWidth < 768);
  const [history, setHistory] = useState<PageId[]>([]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useQueuePersistence(); // Activate queue persistence

  const metadata = usePlayerStore((state) => state.metadata);

  // In compact mode, always use overlay sidebar (regardless of collapsed state)
  const isSidebarOverlay = isCompactSidebar;

  useEffect(() => {
    const handleResize = () => {
      setIsCompactSidebar(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNavigate = (page: string) => {
    const target = page as PageId;
    if (target === currentPage) return;

    setHistory((prev) => [...prev, currentPage]);
    setCurrentPage(target);

    // Clear selection mode when switching pages
    useSelectionStore.getState().clearSelection();

    // Clear Global Overlays when switching main tabs
    if (hasOverlay) {
      useNavigationStore.getState().reset();
    }

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

    // Priority 1: Global Overlay Store (Album/Artist Details)
    if (hasOverlay) {
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

  const mainContent = (
    <div className="flex flex-1 flex-col min-w-0 bg-surface dark:bg-surface-container-low rounded-tl-[24px] border-l border-t border-outline-variant/20 overflow-hidden shadow-sm relative z-0 transition-colors duration-300">
      {/* Drag Region matching main content background */}
      <div data-tauri-drag-region className="h-6 w-full shrink-0 bg-transparent z-10" />

      <main className="flex-1 overflow-y-auto scroll-smooth relative no-scrollbar">
        {/* Simple Fade Transition for Page Switch */}
        <div key={currentPage} className="animate-in fade-in duration-300 slide-in-from-bottom-2 h-full">
          {renderContent()}
        </div>
      </main>

      {/* --- 层级 2: 全局详情栈 (Overlay inside Main Content) --- */}
      <GlobalDetailStack />
    </div>
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-container text-on-surface font-sans">

      {/* 1. 标题栏 (始终在最顶层 z-[100]) */}
      <TitleBar />

      <div className="flex flex-1 overflow-hidden relative">

        {/* --- 层级 1: 正常布局 (侧边栏 + 主内容) --- */}
        <div className="absolute inset-0 z-0 flex">
          <Sidebar
            activeId={currentPage}
            onNavigate={handleNavigate}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            canGoBack={history.length > 0 || hasOverlay}
            onBack={handleBack}
            onSearch={handleSearch}
            isOverlay={isSidebarOverlay}
            onRequestClose={() => setSidebarCollapsed(true)}
          />

          <div className="flex-1 flex flex-col min-w-0 relative">
            {/* Backdrop for overlay mode - positioned relative to content container but covering it */}
            {isSidebarOverlay && !sidebarCollapsed && (
              <div
                className="absolute inset-0 z-40 bg-black/20 backdrop-blur-[1px] animate-in fade-in duration-200"
                onClick={() => setSidebarCollapsed(true)}
              />
            )}

            {/* Reuse mainContent variable content inline or wrapper */}
            {mainContent}
          </div>
        </div>


        {/* --- 层级 3: 沉浸模式 (Now Playing Overlay) --- */}
        <div className={clsx(
          "absolute inset-0 z-[60] transition-all duration-500 cubic-bezier(0.2, 0.0, 0.0, 1.0)",
          isFullScreen
            ? "opacity-100 visible translate-y-0"
            : "opacity-0 invisible translate-y-8 pointer-events-none"
        )}>
          <NowPlayingView metadata={metadata} />
        </div>

      </div>

      {/* 4. 底部播放控制 - M3 Surface Container */}
      <div className="bg-surface-container-high border-t border-outline-variant/10 z-[70] relative">
        <SelectionActionBar />
        <PlayerControl
          isFullScreen={isFullScreen}
          toggleFullScreen={() => setIsFullScreen(!isFullScreen)}
        />
      </div>
    </div>
  );
}

export default App;