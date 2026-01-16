export default function MusicGrid() {
    // 生成 20 个假专辑
    const albums = Array.from({ length: 20 }).map((_, i) => ({
        id: i,
        title: `Album Title ${i + 1}`,
        artist: `Artist Name ${i + 1}`,
        color: ['bg-red-200', 'bg-blue-200', 'bg-green-200', 'bg-purple-200'][i % 4]
    }));

    return (
        <div className="p-8">
            <h2 className="mb-6 text-2xl font-bold text-neutral-800 dark:text-neutral-100">
                最近播放
            </h2>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {albums.map((album) => (
                    <div
                        key={album.id}
                        className="group flex flex-col gap-3 rounded-xl bg-neutral-100/50 p-3 hover:bg-neutral-200/50 dark:bg-neutral-800/30 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                        {/* 封面区域 */}
                        <div className={`aspect-square w-full rounded-lg shadow-sm ${album.color} dark:opacity-80 group-hover:shadow-md transition-all`} />

                        {/* 文字区域 */}
                        <div className="flex flex-col gap-1">
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
        </div>
    );
}