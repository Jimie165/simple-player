# Verification: Unified Selection & Playlist Logic

## Objective
The goal was to remove the separate custom implementation of selection logic (batch actions, removing items, favoriting) in the Playlist Interface and replace it with the generic `useSongOperations` hook that powers the rest of the application.

## Changes Overview

### 1. `PlaylistDetail.tsx`
- **Updated**: `SortableSongList` usage now passes `playlistId` and `context`.
- **Refined Context**:
  - If viewing a standard playlist: `context="playlist"`, `playlistId={id}`.
  - If viewing "Favorites": `context="library"`, `playlistId={undefined}`.
    - This ensures "Remove" actions in Favorites behave as "Delete from Library" (or we rely on "Toggle Favorite" heart icon for removal from list), preventing the misleading "Remove from Playlist" button which would error out or delete from library unexpectedly.
- **Removed**: Manual `handleRemove` and `handleToggleFavorite` functions were removed. The component now relies on `SortableSongList` delegation to the standard hook.

### 2. `SortableSongList.tsx`
- **Updated Props**: Added `playlistId?` and `context?` to props.
- **Refactored**:
  - Removed local `ConfirmDialog`s and batch action handlers (`handleBatchRemoveFromPlaylist`, etc.).
  - Updated `SongListItemMenu` (the 3-dots menu) to leverage `useSongOperations` completely, removing manual `onDelete` overrides.
  - Updated `ContextMenuResolver` (right-click menu) to leverage `useSongOperations` completely.
  - Passed `playlistId` and `context` down to all sub-components (`SortableItem`, `SongListItem`, `SongListItemMenu`, `ContextMenuResolver`).
- **Cleaned Up**: Removed unused imports and props.

### 3. `useSongOperations.ts`
- **Enhanced**:
  - Improved `handleFavorite` to support "Smart Batch Toggling" (if all selected are favorites -> Unfavorite all; otherwise -> Favorite all).
  - Added logic to explicitly determine `isAllFavorited` state for UI feedback.

## Verification Steps

### Scenario 1: Standard Playlist
1. Open a Playlist.
2. Select multiple songs.
3. Right-click or use the Selection Bar (if available in future, or check context menu).
   - "Remove from Playlist" should be visible.
   - Clicking it should trigger the Global Delete Dialog (managed by `useDialogStore`) and successfully remove items via `libraryService.batchRemoveFromPlaylist`.
4. Click the "Three Dots" menu on a single song.
   - "Remove from Playlist" should appear and work.

### Scenario 2: Favorites Playlist
1. Open "Favorites".
2. Select multiple songs.
3. Right-click.
   - Context is `library`.
   - Option should be "Delete from Library" (Trash Icon), NOT "Remove from Playlist".
   - This aligns with "Favorites" being a filter view of the library. To remove from Favorites only, toggle the Heart icon.

### Scenario 3: Batch Favorites
1. In any view (Library/Playlist), select multiple songs.
2. Click "Favorite" (Heart) in the Context Menu.
   - If mixed state: All become Favorited.
   - If all Favorited: All become Unfavorited.
   - UI updates immediately due to `triggerLibraryUpdate`.

## Conclusion
The Playlist Detail view no longer maintains its own duplicate logic for item management. It is now fully driven by the centralized `useSongOperations` hook, reducing code maintenance burden and ensuring consistent behavior across the app.
