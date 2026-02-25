import { useState, useEffect, useRef } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import clsx from 'clsx';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { AnimatePresence, motion } from 'framer-motion';

import TitleBar from '@/components/layout/TitleBar';
import Sidebar from '@/components/layout/Sidebar';
import GlobalDetailStack from '@/components/layout/GlobalDetailStack';
import ScrollArea from '@/components/common/ScrollArea';

import MusicGrid from '@/features/home/MusicGrid';
import Library from '@/features/library/Library';
import { VideoLibrary } from '@/features/videos/VideoLibrary';
import Settings from '@/features/settings/Settings';
import NowPlayingView from '@/features/player/NowPlayingView';
import PlayerControl from '@/features/player/PlayerControl';
import AppleMusicPlayer from '@/features/player/AppleMusicPlayer';

import { usePlayerStore } from '@/store/usePlayerStore';
import type { PageId } from '@/types/index';
import SearchResultsView from '@/features/search/SearchResultsView';
import PlaylistsRoot from '@/features/playlists/PlaylistsRoot';
import { useQueuePersistence } from '@/hooks/playback/useQueuePersistence';
import { useGlobalEvents } from '@/hooks/useGlobalEvents';
import SelectionMenuBar from '@/components/common/SelectionMenuBar';
import AddToPlaylistSheet from '@/features/playlists/dialogs/AddToPlaylistSheet';
import GlobalDialogLayer from '@/components/common/GlobalDialogLayer';
import VideoPlayerOverlay from '@/features/player/VideoPlayerOverlay';
import { Toaster } from 'react-hot-toast';

function App() {
  const { init: initTheme, fullScreenMode } = useThemeStore();
  const playlist = useLibraryStore((state) => state.playlist);
  const currentSongIndex = useLibraryStore((state) => state.currentSongIndex);
  const setMetadata = usePlayerStore((state) => state.setMetadata);

  useEffect(() => initTheme(), [initTheme]);

  // Restore Session
  const isRestored = useRef(false);
  useEffect(() => {
    // Restore only once when playlist is ready and populated
    if (!isRestored.current && !usePlayerStore.getState().metadata && playlist.length > 0 && currentSongIndex >= 0 && currentSongIndex < playlist.length) {
      const song = playlist[currentSongIndex];
      setMetadata(song);
      // Ensure paused and time 0
      usePlayerStore.setState({ isPlaying: false });
      isRestored.current = true;
    }
  }, [playlist, currentSongIndex, setMetadata]);

  const {
    currentPage,
    mainHistory,
    hasOverlay,
    navigate: storeNavigate,
    goBack: storeGoBack
  } = useNavigationStore();

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isCompactSidebar, setIsCompactSidebar] = useState(() => window.innerWidth < 768);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Listen for Full Screen Player Events
  useEffect(() => {
    const handleOpen = () => setIsFullScreen(true);
    const handleClose = () => setIsFullScreen(false);

    window.addEventListener('open-fullscreen-player', handleOpen);
    window.addEventListener('close-fullscreen-player', handleClose);

    return () => {
      window.removeEventListener('open-fullscreen-player', handleOpen);
      window.removeEventListener('close-fullscreen-player', handleClose);
    };
  }, []);

  const [searchQuery, setSearchQuery] = useState('');

  useQueuePersistence(); // Activate queue persistence
  useGlobalEvents(); // Activate global event listeners

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
    storeNavigate(target);

    // Clear selection mode when switching pages
    useSelectionStore.getState().clearSelection();

    if (isFullScreen) setIsFullScreen(false);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    handleNavigate('search');
  };

  const handleBack = () => {
    storeGoBack(() => {
      // Priority 1: Selection Mode
      if (useSelectionStore.getState().isSelectionMode) {
        useSelectionStore.getState().clearSelection();
        // User Request: "I need to clear selection mode, AND ALSO return to previous level"
        // So we return false here to allow the storeGoBack to proceed with popping history/overlay.
        return false;
      }

      // Priority 2: Full Screen
      if (isFullScreen) {
        setIsFullScreen(false);
        return true;
      }

      return false; // Continue to pop overlays/history
    });
  };

  const renderContent = () => {
    switch (currentPage) {
      case 'home': return <MusicGrid />;
      case 'library': return <Library />;
      case 'videos': return <VideoLibrary />;
      case 'settings': return <Settings />;
      case 'search': return <SearchResultsView query={searchQuery} />;
      case 'playlists': return <PlaylistsRoot />;
      default: return null;
    }
  };

  const mainContent = (
    <div className="flex flex-1 flex-col min-w-0 bg-surface dark:bg-surface-container-low rounded-tl-2xl overflow-hidden shadow-sm relative z-0 transition-colors duration-300">
      {/* 标题栏背景，带高斯模糊，衔接窗口圆角 */}
      <div
        data-tauri-drag-region
        className="absolute top-0 left-0 right-0 h-12 bg-surface/70 dark:bg-surface-container-low/70 backdrop-blur-xl z-40 border-b border-outline-variant/5"
      />

      <ScrollArea className="flex-1 relative" topOffset={48}>
        <div className="pt-12 min-h-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="h-full"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* --- 层级 2: 全局详情栈 (Overlay inside Main Content) --- */}
      <GlobalDetailStack />

      {/* 选择操作栏 - 现在放在这里，使用 absolute 定位 */}
      <SelectionMenuBar />
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
            canGoBack={mainHistory.length > 0 || hasOverlay || isFullScreen}
            onBack={handleBack}
            onSearch={handleSearch}
            isOverlay={isSidebarOverlay}
            onRequestClose={() => setSidebarCollapsed(true)}
          />

          <div className="flex-1 flex flex-col min-w-0 relative bg-surface-container before:absolute before:inset-0 before:bg-primary/5 before:pointer-events-none">
            {/* Backdrop for overlay mode - positioned relative to content container but covering it */}
            {isSidebarOverlay && !sidebarCollapsed && (
              <div
                className="absolute inset-0 z-40 bg-primary/5 backdrop-blur-[2px] animate-in fade-in duration-200 rounded-2xl"
                onClick={() => setSidebarCollapsed(true)}
              />
            )}

            {/* Reuse mainContent variable content inline or wrapper */}
            {mainContent}
          </div>
        </div>


        {/* --- 层级 3: 沉浸模式 (Now Playing Overlay) --- */}
        <div className={clsx(
          "absolute inset-0 transition-all duration-500 cubic-bezier(0.2, 0.0, 0.0, 1.0)",
          // Z-Index Switch: If immersive mode and active, cover EVERYTHING (z-80). Otherwise z-60 (under bottom bar).
          // Note: Bottom Bar is z-[70].
          (isFullScreen && fullScreenMode === 'immersive') ? "z-[80]" : "z-[60]",
          isFullScreen
            ? "opacity-100 visible translate-y-0"
            : "opacity-0 invisible translate-y-8 pointer-events-none"
        )}>
          <NowPlayingView metadata={metadata} />
        </div>

      </div>

      {/* 4. 底部播放控制 - M3 Surface Container */}
      <div className="bg-surface-container-high border-t border-outline-variant/10 z-[70] relative">
        <PlayerControl
          isFullScreen={isFullScreen}
          onToggleFullScreen={() => setIsFullScreen(!isFullScreen)}
        />
      </div>
      <AddToPlaylistSheet />
      <GlobalDialogLayer />

      <VideoPlayerOverlay
        isOpen={usePlayerStore((s) => s.isVideoMode)}
        onClose={() => usePlayerStore.getState().setVideoMode(false)}
      />

      <AppleMusicPlayer
        isOpen={isFullScreen && fullScreenMode === 'immersive'}
        onClose={() => setIsFullScreen(false)}
      />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--md-sys-color-surface-container-high)',
            color: 'var(--md-sys-color-on-surface)',
            borderRadius: '28px', // M3 Pill shape
            padding: '12px 24px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            fontSize: '14px',
            fontWeight: 500,
          },
          // Tailwind classes can also be used if needed, but style object guarantees overriding default inline styles
          className: 'border border-outline-variant/20',
        }}
      />
    </div>
  );
}

export default App;
