
import { create } from 'zustand';

// "recent" is a special type that allows mixing file, folder, album in Recently Used
type SelectionType = 'song' | 'album' | 'artist' | 'folder' | 'file' | 'recent' | 'playlist' | 'video' | null;

interface SelectionState {
    isSelectionMode: boolean;
    selectedIds: Set<string>; // Use IDs or unique identifiers (like path for files)
    selectedItemsMap: Map<string, any>; // Store actual objects
    selectionType: SelectionType;
    selectableIds: Set<string>;

    // Actions
    toggleSelectionMode: (initialItem?: { id: string, type: SelectionType, data: any }) => void;
    setSelectionMode: (active: boolean) => void;
    selectItem: (id: string, type: SelectionType, data: any) => void;
    deselectItem: (id: string) => void;
    toggleSelection: (id: string, type: SelectionType, data: any) => void;
    clearSelection: () => void;
    selectAll: (items: { id: string, data: any }[], type: SelectionType) => void;
    setSelectableIds: (ids: string[]) => void;

    // Global Select All Request signal
    selectAllRequested: boolean;
    setSelectAllRequested: (requested: boolean) => void;
}

// Helper to check if types are compatible for mixed selection
const areTypesCompatible = (type1: SelectionType, type2: SelectionType): boolean => {
    // 'recent' is compatible with file, folder, album, playlist (for Recently Used section)
    const recentTypes: SelectionType[] = ['file', 'folder', 'album', 'recent', 'playlist', 'video'];
    if (recentTypes.includes(type1) && recentTypes.includes(type2)) {
        return true;
    }
    // Same types are always compatible
    return type1 === type2;
};

export const useSelectionStore = create<SelectionState>((set, get) => ({
    isSelectionMode: false,
    selectedIds: new Set(),
    selectedItemsMap: new Map(),
    selectionType: null,
    selectableIds: new Set(),

    toggleSelectionMode: (initialItem) => {
        const { isSelectionMode, clearSelection } = get();
        if (isSelectionMode) {
            clearSelection();
            set({ isSelectionMode: false, selectionType: null });
        } else {
            // Clear any stale selectionType when entering selection mode
            set({ isSelectionMode: true, selectionType: null, selectedIds: new Set(), selectedItemsMap: new Map() });
            if (initialItem) {
                get().selectItem(initialItem.id, initialItem.type, initialItem.data);
            }
        }
    },

    setSelectionMode: (active: boolean) => {
        set({ isSelectionMode: active });
        if (!active) {
            get().clearSelection();
        }
    },

    selectItem: (id, type, data) => {
        set((state) => {
            // Check if types are compatible
            if (state.selectionType && state.selectedIds.size > 0) {
                if (!areTypesCompatible(state.selectionType, type)) {
                    // Types not compatible, reset selection
                    const newMap = new Map();
                    newMap.set(id, data);
                    return {
                        selectionType: type,
                        selectedIds: new Set([id]),
                        selectedItemsMap: newMap
                    };
                }
            }

            const newSet = new Set(state.selectedIds);
            newSet.add(id);
            const newMap = new Map(state.selectedItemsMap);
            newMap.set(id, data);

            // Determine the selection type
            // If mixing file/folder/album/playlist, set to 'recent'
            // video and song should remain separate
            let finalType = type;
            if (state.selectionType && areTypesCompatible(state.selectionType, type) && state.selectionType !== type) {
                const mixableTypes = ['file', 'folder', 'album', 'recent', 'playlist', 'video'];
                if (mixableTypes.includes(state.selectionType as string) &&
                    mixableTypes.includes(type as string)) {
                    finalType = 'recent';
                }
            }

            return {
                selectedIds: newSet,
                selectedItemsMap: newMap,
                selectionType: finalType
            };
        });
    },

    deselectItem: (id) => {
        set((state) => {
            const newSet = new Set(state.selectedIds);
            newSet.delete(id);
            const newMap = new Map(state.selectedItemsMap);
            newMap.delete(id);

            // If no items left, exit selection mode
            if (newSet.size === 0) {
                return {
                    selectedIds: newSet,
                    selectedItemsMap: newMap,
                    selectionType: null,
                    isSelectionMode: false
                };
            }

            return { selectedIds: newSet, selectedItemsMap: newMap };
        });
    },

    toggleSelection: (id, type, data) => {
        const { selectedIds, selectItem, deselectItem } = get();
        if (selectedIds.has(id)) {
            deselectItem(id);
        } else {
            selectItem(id, type, data);
        }
    },

    clearSelection: () => {
        set({ selectedIds: new Set(), selectedItemsMap: new Map(), selectionType: null, isSelectionMode: false, selectableIds: new Set() });
    },

    selectAll: (items, type) => {
        const ids = new Set(items.map(i => i.id));
        const map = new Map();
        items.forEach(i => map.set(i.id, i.data));
        set({
            selectedIds: ids,
            selectedItemsMap: map,
            selectionType: type
        });
    },

    setSelectableIds: (ids) => {
        set({ selectableIds: new Set(ids) });
    },

    selectAllRequested: false,
    setSelectAllRequested: (requested) => set({ selectAllRequested: requested })
}));
