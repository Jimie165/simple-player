// frontend/src/components/Library.tsx
import { useState } from 'react';
import PageContainer from './PageContainer';
import { MdMusicNote, MdAlbum, MdPerson, MdPlayArrow, MdAccessTime, MdCreateNewFolder, MdShuffle } from 'react-icons/md';
import { IoPlay } from 'react-icons/io5';
import clsx from 'clsx';

// ... (MOCK 数据代码保持不变，请完整保留) ...
// (为了节省篇幅，这里省略 MOCK 数据定义，复制时请不要删除它们)
const MOCK_SONGS = Array.from({ length: 30 }).map((_, i) => ({
    id: i,
    title: `Song Title ${i + 1}`,
    artist: `Artist Name ${i % 5 + 1}`,
    album: `Album Name ${i % 8 + 1}`,
    duration: '3:45',
    cover: ['bg-red-200', 'bg-blue-200', 'bg-green-200', 'bg-purple-200'][i % 4]
}));
const MOCK_ALBUMS = Array.from({ length: 12 }).map((_, i) => ({
    id: i,
    title: `Album Name ${i + 1}`,
    artist: `Artist Name ${i % 5 + 1}`,
    year: 2024 - i,
    cover: ['bg-orange-200', 'bg-teal-200', 'bg-indigo-200', 'bg-pink-200'][i % 4]
}));
const MOCK_ARTISTS = Array.from({ length: 8 }).map((_, i) => ({
    id: i,
    name: `Artist Name ${i + 1}`,
    count: `${10 + i} 首歌`,
    cover: ['bg-neutral-300', 'bg-stone-300', 'bg-zinc-300', 'bg-slate-300'][i % 4]
}));


// --- 子视图组件 ---

// 1. 歌曲列表视图 (核心修改区域)
const SongListView = ({ songs }: { songs: typeof MOCK_SONGS }) => (
    <div className="w-full relative">
        {/* 【修复原理】
       1. 删除了之前那个独立的 mask div，因为它会占位或导致层级混乱。
       2. 直接将表头设为 sticky top-0。
          因为外层的 main 容器现在已经位于标题栏下方了，所以 top-0 就是完美衔接的位置。
       3. 添加 -mx-8 px-8：
          这让表头的背景色向左右延伸 32px，覆盖掉 PageContainer 的内边距，
          确保内容滚动上去时，是被“整行”遮住的，而不是只遮住中间。
    */}
        <div className="sticky top-0 z-10 grid grid-cols-[auto_4fr_3fr_3fr_1fr] gap-4 py-3 -mx-8 px-8 border-b border-neutral-200/50 dark:border-neutral-800/50 text-xs font-medium text-neutral-500 uppercase tracking-wider bg-white/85 dark:bg-[#272727]/85 backdrop-blur-md transition-colors">
            <div className="w-8 text-center">#</div>
            <div>标题</div>
            <div>专辑</div>
            <div>艺人</div>
            <div className="text-right pr-4"><MdAccessTime className="inline text-base" /></div>
        </div>

        {/* 列表内容 */}
        <div className="flex flex-col pt-2">
            {songs.map((song, index) => (
                <div
                    key={song.id}
                    className="group grid grid-cols-[auto_4fr_3fr_3fr_1fr] gap-4 px-4 py-2.5 items-center hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-default"
                >
                    <div className="w-8 text-center text-sm text-neutral-400 group-hover:text-transparent relative">
                        <span className="group-hover:hidden">{index + 1}</span>
                        <button className="absolute inset-0 hidden group-hover:flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <MdPlayArrow className="text-xl" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 rounded-md shrink-0 ${song.cover}`} />
                        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {song.title}
                        </span>
                    </div>

                    <div className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
                        {song.album}
                    </div>

                    <div className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
                        {song.artist}
                    </div>

                    <div className="text-sm text-neutral-500 dark:text-neutral-400 text-right pr-4 font-variant-numeric">
                        {song.duration}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

// ... (AlbumGridView 和 ArtistGridView 保持不变) ...
const AlbumGridView = ({ albums }: { albums: typeof MOCK_ALBUMS }) => (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pt-2">
        {albums.map((album) => (
            <div key={album.id} className="group flex flex-col gap-3 rounded-xl p-3 -mx-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer">
                <div className={`aspect-square w-full rounded-lg shadow-sm ${album.cover} dark:opacity-80 group-hover:shadow-md group-hover:scale-[1.02] transition-all duration-300 relative overflow-hidden`}>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/10">
                        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg text-white translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                            <IoPlay className="ml-1" />
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{album.title}</span>
                    <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">{album.artist} • {album.year}</span>
                </div>
            </div>
        ))}
    </div>
);

const ArtistGridView = ({ artists }: { artists: typeof MOCK_ARTISTS }) => (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pt-2">
        {artists.map((artist) => (
            <div key={artist.id} className="group flex flex-col items-center gap-3 rounded-xl p-4 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer text-center">
                <div className={`aspect-square w-40 rounded-full shadow-sm ${artist.cover} group-hover:shadow-md group-hover:scale-[1.02] transition-all duration-300 relative overflow-hidden mx-auto`}>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/10">
                        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg text-white">
                            <IoPlay className="ml-1" />
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{artist.name}</span>
                    <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">{artist.count}</span>
                </div>
            </div>
        ))}
    </div>
);

export default function Library() {
    const [currentTab, setCurrentTab] = useState<'songs' | 'albums' | 'artists'>('songs');

    const TabButton = ({ id, label, icon: Icon }: { id: typeof currentTab, label: string, icon: any }) => (
        <button
            onClick={() => setCurrentTab(id)}
            className={clsx(
                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border",
                currentTab === id
                    ? "bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-100"
                    : "bg-transparent text-neutral-600 border-neutral-200 hover:bg-neutral-100 dark:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800"
            )}
        >
            <Icon className="text-lg" />
            <span>{label}</span>
        </button>
    );

    return (
        <PageContainer
            title="音乐库"
            actions={
                <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-200/50 text-neutral-900 hover:bg-neutral-300/50 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 transition-colors text-sm font-medium">
                    <MdCreateNewFolder className="text-lg" />
                    <span>添加文件夹</span>
                </button>
            }
        >
            <div className="flex flex-col h-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-2">
                        <TabButton id="songs" label="歌曲" icon={MdMusicNote} />
                        <TabButton id="albums" label="专辑" icon={MdAlbum} />
                        <TabButton id="artists" label="艺人" icon={MdPerson} />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-1.5 rounded-full text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-colors text-sm font-medium">
                        <MdShuffle className="text-lg" />
                        <span>随机播放全部</span>
                    </button>
                </div>

                <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {currentTab === 'songs' && <SongListView songs={MOCK_SONGS} />}
                    {currentTab === 'albums' && <AlbumGridView albums={MOCK_ALBUMS} />}
                    {currentTab === 'artists' && <ArtistGridView artists={MOCK_ARTISTS} />}
                </div>
            </div>
        </PageContainer>
    );
}