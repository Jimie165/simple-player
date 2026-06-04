import { create } from 'zustand';
import type { SongMetadata, RecentItem } from '@/types';

// 定义通用的音乐项类型，涵盖 SongMetadata, RecentItem 等
export type MusicItem = SongMetadata | RecentItem | unknown;

interface DialogState {
    // 删除确认弹窗
    deleteConfirm: {
        isOpen: boolean;
        items: MusicItem[]; // 要删除的项目
        onConfirm: () => void; // 确认回调
        title: string;
        description: string;
        confirmText?: string;
    };

    // 属性弹窗
    properties: {
        isOpen: boolean;
        song: SongMetadata | null;
    };

    editSong: {
        isOpen: boolean;
        song: SongMetadata | null;
    };

    // Actions
    openDeleteConfirm: (items: MusicItem[], onConfirm: () => void, text: string, title?: string, confirmText?: string) => void;
    closeDeleteConfirm: () => void;

    openProperties: (song: SongMetadata) => void;
    closeProperties: () => void;

    openEditSong: (song: SongMetadata) => void;
    closeEditSong: () => void;
}

let editSongOpenFrame: number | null = null;

export const useDialogStore = create<DialogState>((set) => ({
    deleteConfirm: {
        isOpen: false,
        items: [],
        onConfirm: () => { },
        title: '删除',
        description: '',
        confirmText: '删除',
    },
    properties: {
        isOpen: false,
        song: null,
    },
    editSong: {
        isOpen: false,
        song: null,
    },

    openDeleteConfirm: (items, onConfirm, description, title = '删除', confirmText = '删除') =>
        set({
            deleteConfirm: {
                isOpen: true,
                items,
                onConfirm,
                description,
                title,
                confirmText,
            },
        }),

    closeDeleteConfirm: () =>
        set((state) => ({
            deleteConfirm: { ...state.deleteConfirm, isOpen: false },
        })),

    openProperties: (song) =>
        set({
            properties: {
                isOpen: true,
                song,
            },
        }),

    closeProperties: () =>
        set((state) => ({
            properties: { ...state.properties, isOpen: false },
        })),

    openEditSong: (song) => {
        if (editSongOpenFrame !== null) {
            window.cancelAnimationFrame(editSongOpenFrame);
        }

        set({
            editSong: {
                isOpen: false,
                song,
            },
        });

        editSongOpenFrame = window.requestAnimationFrame(() => {
            editSongOpenFrame = null;
            set((state) => ({
                editSong: state.editSong.song === song
                    ? { ...state.editSong, isOpen: true }
                    : state.editSong,
            }));
        });
    },

    closeEditSong: () => {
        if (editSongOpenFrame !== null) {
            window.cancelAnimationFrame(editSongOpenFrame);
            editSongOpenFrame = null;
        }

        set((state) => ({
            editSong: { ...state.editSong, isOpen: false },
        }));
    },
}));
