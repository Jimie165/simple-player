export { getGridTemplateColumns } from '@/features/playlists/songlist/sortableSongListUtils';

/** 所有歌曲列表共用的行内边距与列间距：封面对齐页面内容，喜爱按钮落在左侧边距内。 */
export const SONG_LIST_GRID_GAP = 'gap-3';
export const SONG_LIST_ROW_PADDING = 'pl-3 pr-10';
export const SONG_LIST_HOVER_BACKGROUND = 'before:left-10 before:right-9';
export const SONG_LIST_DIVIDER_RIGHT = 'after:right-9';

export function songListDividerLeft(isLast: boolean, hideCover: boolean): string {
    if (isLast) return 'after:left-12';
    return hideCover ? 'after:left-20' : 'after:left-26';
}
