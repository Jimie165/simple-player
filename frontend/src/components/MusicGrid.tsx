import type { Dispatch, SetStateAction } from 'react';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import PageContainer from './PageContainer';
import { IoPlay } from 'react-icons/io5';
// 引入新图标：文件、文件夹、下拉箭头
import { MdFileOpen, MdFolderOpen, MdKeyboardArrowDown } from 'react-icons/md';
import type { SongMetadata } from '../types';

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

interface MusicGridProps {
    onPlay: () => void;
    setMetadata: Dispatch<SetStateAction<SongMetadata | null>>;
}

export default function MusicGrid({ onPlay, setMetadata }: MusicGridProps) {
    const albums = Array.from({ length: 20 }).map((_, i) => ({
        id: i,
        title: `Album Title ${i + 1}`,
        artist: `Artist Name ${i + 1}`,
        color: ['bg-red-200', 'bg-blue-200', 'bg-green-200', 'bg-purple-200'][i % 4]
    }));

    // 定义下拉菜单组件
    const OpenFileMenu = () => {
        return (
            <Menu>
                <MenuButton className="
                    relative inline-flex items-center gap-2 px-4 py-2 rounded-lg 
                    bg-neutral-200 text-neutral-900 hover:bg-neutral-300
                    dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600
                    transition-colors text-sm font-medium z-20
                ">
                    <MdFileOpen className="text-lg" />
                    <span>打开文件</span>
                    <MdKeyboardArrowDown className="text-lg opacity-70" />
                </MenuButton>

                <MenuItems
                    transition
                    className="
                        absolute right-0 mt-2 w-48 origin-top-right divide-y divide-gray-100 rounded-xl 
                        bg-white dark:bg-neutral-800 
                        shadow-lg ring-1 ring-black/5 focus:outline-none
                        border border-neutral-200 dark:border-neutral-700 overflow-hidden
                        transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0
                        z-50
                    "
                >
                    <div className="p-1">
                        <MenuItem>
                            <button
                                onClick={handleOpenFile}
                                className="
                                    group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm 
                                    transition-colors text-neutral-900 dark:text-neutral-200
                                    data-[focus]:bg-blue-50 data-[focus]:text-blue-600 
                                    dark:data-[focus]:bg-white/10 dark:data-[focus]:text-blue-300
                                "
                            >
                                <MdFileOpen className="text-lg opacity-70" />
                                打开文件
                            </button>
                        </MenuItem>
                        <MenuItem>
                            <button
                                onClick={() => console.log('Open Folder Clicked')}
                                className="
                                    group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm 
                                    transition-colors text-neutral-900 dark:text-neutral-200
                                    data-[focus]:bg-blue-50 data-[focus]:text-blue-600 
                                    dark:data-[focus]:bg-white/10 dark:data-[focus]:text-blue-300
                                "
                            >
                                <MdFolderOpen className="text-lg opacity-70" />
                                打开文件夹
                            </button>
                        </MenuItem>
                    </div>
                </MenuItems>
            </Menu>
        );
    };

    const handleOpenFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'mp4'] }] // 加上 mp4/m4a
            });

            if (selected && typeof selected === 'string') {
                // 1. 先获取元数据
                let meta = null;
                try {
                    // 注意：Rust 返回的是 Result，前端 invoke 会抛出异常如果 Error
                    // 这里我们用 invoke 返回值
                    meta = await invoke<SongMetadata>('get_metadata', { path: selected });
                    console.log('Metadata:', meta);
                    setMetadata(meta);
                } catch (e) {
                    console.error('Failed to load metadata:', e);
                    // 构建默认 meta
                    meta = {
                        title: selected.split('\\').pop() || 'Unknown File',
                        artist: 'Unknown Artist',
                        album: 'Unknown Album',
                        duration: 0,
                        cover: null
                    };
                    setMetadata(meta);
                }

                // 2. 播放音频 (并将 meta 传给后端用于 SMTC)
                await invoke('play_audio', { path: selected, metadata: meta });
                onPlay();
            }
        } catch (err) {
            console.error('Failed to open audio:', err);
        }
    };

    return (
        <PageContainer
            title="主页"
            actions={<OpenFileMenu />} // 这里替换掉了之前的随机播放按钮
        >
            <section>
                {/* 副标题：最近播放 */}
                <h2 className="mb-4 text-xl font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                    <span>最近使用</span> {/* 改个名叫“最近使用”可能更贴切 Win11 风格 */}
                </h2>

                {/* 封面网格 (保持不变) */}
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                    {albums.map((album) => (
                        <div
                            key={album.id}
                            className="group flex flex-col gap-3 rounded-xl p-3 -mx-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer"
                        >
                            <div className={`aspect-square w-full rounded-lg shadow-sm ${album.color} dark:opacity-80 group-hover:shadow-md group-hover:scale-[1.02] transition-all duration-300 relative overflow-hidden`}>
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/10">
                                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg text-white translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                        <IoPlay className="ml-1" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-0.5">
                                <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                                    {album.title}
                                </span>
                                <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                                    {album.artist}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </PageContainer>
    );
}