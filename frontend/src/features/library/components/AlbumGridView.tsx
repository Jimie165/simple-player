import { IoPlay, IoMusicalNotes, IoEllipsisHorizontal, IoAdd, IoPerson, IoDisc, IoCheckmark } from 'react-icons/io5';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import type { SongMetadata } from '../../../types';

// 定义专辑数据结构
export interface AlbumData {
    name: string;
    artist: string;
    cover: string | null;
    songs: SongMetadata[]; // 包含的歌曲
}

interface AlbumGridViewProps {
    albums: AlbumData[];
    onPlayAlbum: (album: AlbumData) => void;
    onOpenAlbum: (album: AlbumData) => void;
}

export default function AlbumGridView({ albums, onPlayAlbum, onOpenAlbum }: AlbumGridViewProps) {
    return (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pt-2 pb-8">
            {albums.map((album) => (
                <div
                    key={album.name + album.artist}
                    className="group flex flex-col gap-3 rounded-2xl p-4 -mx-4 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => onOpenAlbum(album)}
                >
                    {/* 封面区域 (M3 风格：更大的圆角，阴影) */}
                    <div className="aspect-square w-full rounded-2xl shadow-sm bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative border border-black/5 dark:border-white/5">
                        {album.cover ? (
                            <img src={album.cover} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500 ease-out" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                <IoMusicalNotes className="text-6xl opacity-50" />
                            </div>
                        )}

                        {/* 交互遮罩：仅在hover时出现，渐变背景提供更好的文字对比度 */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">

                            {/* 左下角：播放按钮 (M3 FAB 风格) */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPlayAlbum(album);
                                }}
                                className="absolute bottom-3 left-3 w-10 h-10 rounded-full bg-white dark:bg-[#d34836] shadow-lg flex items-center justify-center text-black dark:text-white hover:scale-110 active:scale-95 transition-all duration-200 z-10"
                                title="播放专辑"
                            >
                                <IoPlay className="translate-x-0.5" />
                            </button>

                            {/* 右下角：更多菜单 (M3 风格) */}
                            <div className="absolute bottom-3 right-3" onClick={(e) => e.stopPropagation()}>
                                <Menu as="div" className="relative">
                                    <MenuButton className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors">
                                        <IoEllipsisHorizontal />
                                    </MenuButton>
                                    <MenuItems
                                        transition
                                        anchor="bottom end"
                                        className="w-56 origin-top-right rounded-xl border border-neutral-200 bg-white p-1 text-sm/6 text-neutral-900 shadow-xl ring-1 ring-black/5 focus:outline-none dark:bg-[#2c2c2c] dark:border-neutral-700 dark:text-white transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 z-50"
                                    >
                                        <MenuItem>
                                            <button onClick={() => onPlayAlbum(album)} className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                                <IoPlay className="size-4 opacity-70" />
                                                播放
                                            </button>
                                        </MenuItem>
                                        <MenuItem>
                                            <button className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                                <IoAdd className="size-4 opacity-70" />
                                                加入播放队列
                                            </button>
                                        </MenuItem>
                                        <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />
                                        <MenuItem>
                                            <button className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                                <IoAdd className="size-4 opacity-70" />
                                                <span>添加到</span>
                                                <span className="ml-auto text-xs opacity-50">&gt;</span>
                                            </button>
                                        </MenuItem>

                                        <MenuItem>
                                            <button onClick={() => onOpenAlbum(album)} className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                                <IoDisc className="size-4 opacity-70" />
                                                显示专辑
                                            </button>
                                        </MenuItem>
                                        <MenuItem>
                                            <button className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                                <IoPerson className="size-4 opacity-70" />
                                                显示艺术家
                                            </button>
                                        </MenuItem>
                                        <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />
                                        <MenuItem>
                                            <button className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                                <IoCheckmark className="size-4 opacity-70" />
                                                选择
                                            </button>
                                        </MenuItem>
                                    </MenuItems>
                                </Menu>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-0.5 px-1">
                        <span className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-50" title={album.name}>
                            {album.name}
                        </span>
                        <span className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={album.artist}>
                            {album.artist}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}