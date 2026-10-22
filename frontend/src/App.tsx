import { pageMotion } from '@/utils/viewTransition';
import { useState, useEffect, useRef, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useThemeStore } from '@/store/useThemeStore';
import { useAudioOutputStore } from '@/store/useAudioOutputStore';
import { audioService } from '@/services/audioService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { AnimatePresence, motion } from 'framer-motion';

import TitleBar from '@/components/layout/TitleBar';
import Sidebar from '@/components/layout/Sidebar';
import GlobalDetailStack from '@/components/layout/GlobalDetailStack';
import { ContentSurface } from '@/components/layout/ContentSurface';
import { ContentTheme } from '@/components/layout/ContentTheme';
import ScrollArea from '@/components/common/ScrollArea';
import { CoverTransitionOverlay } from '@/components/common/SharedCover';

import MusicGrid from '@/features/home/MusicGrid';
import Library from '@/features/library/Library';
import { VideoLibrary } from '@/features/videos/VideoLibrary';
import Settings from '@/features/settings/Settings';
import PlayerControl from '@/features/player/PlayerControl';
import NowPlayingView from '@/features/player/NowPlayingView';
import NowPlayingQueue from '@/features/player/NowPlayingQueue';

import { usePlayerStore } from '@/store/usePlayerStore';
import type { PageId } from '@/types/index';
import SearchResultsView from '@/features/search/SearchResultsView';
import PlaylistsRoot, { PlaylistDetailOverlay } from '@/features/playlists/PlaylistsRoot';
import { useQueuePersistence } from '@/hooks/playback/useQueuePersistence';
import { useGlobalEvents } from '@/hooks/useGlobalEvents';
import { useImmersivePlayerTransition } from '@/features/player/hooks/useImmersivePlayerTransition';
import SelectionMenuBar from '@/components/common/SelectionMenuBar';
import AddToPlaylistSheet from '@/features/playlists/dialogs/AddToPlaylistSheet';
import GlobalDialogLayer from '@/components/common/GlobalDialogLayer';
import VideoPlayerOverlay from '@/features/player/VideoPlayerOverlay';
import { Toaster } from 'react-hot-toast';
import EditableContextMenu from '@/components/common/EditableContextMenu';
import { PlaybackRuntime } from '@/features/player/runtime/usePlaybackRuntime';
import { useAutoUpdateCheck } from '@/hooks/useAutoUpdateCheck';

const FULL_PLAYER_MIN_WIDTH = 820;
const CONTENT_QUEUE_WIDTH = 300;

function App() {
  const { init: initTheme } = useThemeStore();
  const playlist = useLibraryStore((state) => state.playlist);
  const currentSongIndex = useLibraryStore((state) => state.currentSongIndex);
  const setMetadata = usePlayerStore((state) => state.setMetadata);

  useEffect(() => initTheme(), [initTheme]);

  useEffect(() => {
    useLibraryStore.getState().refreshFavorites();
    useLibraryStore.getState().refreshRecentHistory();
  }, []);

  // Sync persisted audio output preference to backend on launch and listen for backend-driven changes.
  useEffect(() => {
    useAudioOutputStore.getState().syncToBackend();
    const unlisten = listen<string | null>('audio:output-changed', (e) => {
      audioService.getAudioOutput()
        .then((state) => {
          useAudioOutputStore.setState({
            preferredDevice: state.preference,
            activeDevice: state.active_device,
          });
        })
        .catch(() => {
          useAudioOutputStore.getState().setActiveDevice(e.payload ?? null);
        });
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => { });
    };
  }, []);

  // 旧封面缩略图在后台补齐后，让当前可见图片切换到低内存版本。
  useEffect(() => {
    const unlisten = listen('cover-thumbnails-ready', () => {
      useLibraryStore.getState().triggerLibraryUpdate();
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => { });
    };
  }, []);
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
    activePlaylistDetail,
    navigate: storeNavigate,
    goBack: storeGoBack
  } = useNavigationStore();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isCompactSidebar, setIsCompactSidebar] = useState(() => window.innerWidth < 768);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const {
    isOpen: isFullScreen,
    isBaseLayerFrozen,
    close: closeFullScreenPlayer,
    toggle: toggleFullScreenPlayer,
    handleOpened: handleFullScreenPlayerOpened,
  } = useImmersivePlayerTransition();

  const [searchQuery, setSearchQuery] = useState('');

  useQueuePersistence(); // Activate queue persistence
  useGlobalEvents(); // Activate global event listeners
  useAutoUpdateCheck();

  // In compact mode, always use overlay sidebar (regardless of collapsed state)
  const isSidebarOverlay = isCompactSidebar;

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setIsCompactSidebar(window.innerWidth < 768);
      const nextSidebarOffset = window.innerWidth < 768 || sidebarCollapsed ? 72 : 280;
      if (window.innerWidth - nextSidebarOffset < FULL_PLAYER_MIN_WIDTH) setIsQueueOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarCollapsed]);

  const sidebarOffset = isSidebarOverlay || sidebarCollapsed ? 72 : 280;
  const mainContentWidth = windowWidth - sidebarOffset;
  // 以队列收起时的完整控件为基准，避免队列自身占宽触发关闭。
  const canShowQueue = mainContentWidth >= FULL_PLAYER_MIN_WIDTH;
  const queueOffset = isQueueOpen && canShowQueue ? CONTENT_QUEUE_WIDTH : 0;
  const playerWidth = mainContentWidth - queueOffset;
  const playerMode = playerWidth < 560 ? 'mini' : playerWidth < FULL_PLAYER_MIN_WIDTH ? 'compact' : 'full';
  const handleNavigate = (page: string) => {
    const target = page as PageId;
    storeNavigate(target);

    // Clear selection mode when switching pages
    useSelectionStore.getState().clearSelection();

    if (isFullScreen) void closeFullScreenPlayer();
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
        void closeFullScreenPlayer();
        return true;
      }

      return false; // Continue to pop overlays/history
    });
  };

  // 侧栏和队列开关只改变外壳布局，页面由自己的 store/effect 更新。
  const pageContent = useMemo(() => {
    switch (currentPage) {
      case 'home': return <MusicGrid />;
      case 'library': return <Library />;
      case 'videos': return <VideoLibrary />;
      case 'settings': return <Settings />;
      case 'search': return <SearchResultsView query={searchQuery} />;
      case 'playlists': return <PlaylistsRoot />;
      default: return null;
    }
  }, [currentPage, searchQuery]);

  const mainContent = (
    <div
      data-main-content-query
      className="main-content-query flex flex-1 flex-col min-w-0 rounded-tl-2xl overflow-hidden relative z-0"
    >
      {/* 标题栏背景，带高斯模糊，衔接窗口圆角 */}
      <div
        data-tauri-drag-region
        className={`absolute top-0 left-0 right-0 h-12 z-40 border-b transition-colors duration-300 ${activePlaylistDetail
          ? 'bg-transparent border-transparent'
          : 'bg-surface/70 dark:bg-surface-container-low/70 backdrop-blur-xl border-outline-variant/5'
          }`}
      />

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            {...pageMotion}
            className="absolute inset-0 min-w-0 overflow-hidden bg-surface dark:bg-surface-container-low"
          >
            <ScrollArea className="h-full" topOffset={48}>
              <div className="pt-12 min-h-full pb-24 transition-colors duration-300">
                {pageContent}
              </div>
            </ScrollArea>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* --- 层级 2: 全局详情栈 (Overlay inside Main Content) --- */}
      <PlaylistDetailOverlay />
      <GlobalDetailStack />
    </div>
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-container text-on-surface font-sans">
      <PlaybackRuntime />

      <div
        className={`flex min-h-0 flex-1 flex-col ${isFullScreen ? 'base-layer-paused' : ''} ${isBaseLayerFrozen ? 'base-layer-frozen' : ''}`}
        inert={isFullScreen}
        aria-hidden={isFullScreen}
      >
        <ContentTheme>
          {/* 1. 标题栏（始终在最顶层 z-100） */}
          <TitleBar />
          <SelectionMenuBar />
          {/* --- 层级 1: 正常布局 (侧边栏 + 主内容) --- */}
          <div className="app-shell-background absolute inset-0 flex">
            <Sidebar
              activeId={currentPage}
              onNavigate={handleNavigate}
              collapsed={sidebarCollapsed}
              onToggle={() => {
                setSidebarCollapsed((prev) => !prev);
                if (windowWidth - 280 < FULL_PLAYER_MIN_WIDTH) setIsQueueOpen(false);
              }}
              canGoBack={mainHistory.length > 0 || hasOverlay || activePlaylistDetail !== null || isFullScreen}
              onBack={handleBack}
              onSearch={handleSearch}
              isOverlay={isSidebarOverlay}
              onRequestClose={() => setSidebarCollapsed(true)}
            />

            <ContentSurface hidePageBackground={hasOverlay}>
              {/* Backdrop for overlay mode - positioned relative to content container but covering it */}
              {isSidebarOverlay && !sidebarCollapsed && (
                <div
                  className="absolute inset-0 z-40 bg-primary/5 backdrop-blur-[2px] animate-in fade-in duration-200 rounded-2xl"
                  onClick={() => setSidebarCollapsed(true)}
                />
              )}

              {/* Reuse mainContent variable content inline or wrapper */}
              {mainContent}

              <AnimatePresence initial={false}>
                {isQueueOpen && canShowQueue && (
                  <motion.aside
                    id="content-play-queue"
                    aria-label="播放队列"
                    initial={{ width: 0 }}
                    animate={{ width: CONTENT_QUEUE_WIDTH }}
                    exit={{ width: 0 }}
                    transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
                    className="content-queue-shell relative z-30 shrink-0 min-h-0"
                  >
                    <div className="relative h-full w-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 flex flex-col w-75 pt-12">
                      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-10" />
                      <NowPlayingQueue
                        variant="content"
                        isOpen={isQueueOpen}
                        onClose={() => setIsQueueOpen(false)}
                        onNavigate={() => setIsQueueOpen(false)}
                      />
                      </div>
                    </div>
                  </motion.aside>
                )}
              </AnimatePresence>
            </ContentSurface>
          </div>
          {/* 4. 底部播放控制 - M3 Surface Container */}
          <div className="relative z-70">
            <PlayerControl
              isFullScreen={isFullScreen}
              isSuspended={isFullScreen}
              onToggleFullScreen={toggleFullScreenPlayer}
              sidebarOffset={sidebarOffset}
              rightOffset={queueOffset}
              mode={playerMode}
              isQueueOpen={isQueueOpen}
              canShowQueue={canShowQueue}
              onToggleQueue={() => setIsQueueOpen((open) => !open)}
            />
          </div>
        </ContentTheme>
      </div>
      <AddToPlaylistSheet />
      <GlobalDialogLayer />

      <VideoPlayerOverlay
        isOpen={usePlayerStore((s) => s.isVideoMode)}
        onClose={() => {
          const state = usePlayerStore.getState();
          state.setVideoMode(false);
          state.setMediaKind(null);
        }}
      />
      <EditableContextMenu />
      <CoverTransitionOverlay />

      <NowPlayingView
        isOpen={isFullScreen}
        onClose={() => void closeFullScreenPlayer()}
        onOpened={handleFullScreenPlayerOpened}
        mainContentWidth={mainContentWidth}
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
