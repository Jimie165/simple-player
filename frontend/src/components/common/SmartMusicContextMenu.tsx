import MusicContextMenu from './MusicContextMenu';
import { useSongOperations } from '../../hooks/useSongOperations';
import type { MusicMenuContext } from '../../hooks/useSongOperations';
import type { MusicItem } from '../../utils/musicItemUtils';

interface SmartMusicContextMenuProps {
    items: MusicItem[] | MusicItem; // 支持单个或数组，方便使用
    context: MusicMenuContext;
    playlistId?: number;
    className?: string;
    buttonClassName?: string;
    variant?: 'glass' | 'clean';
    onOpen?: () => void;
    // 覆盖/额外回调
    onPlay?: () => void;
    onDelete?: () => void;
    onShuffle?: () => void;
    onSelect?: () => void;
    hideSelect?: boolean;
    selectText?: string;
    isSelected?: boolean;
}

/**
 * 智能菜单组件 (Three Dots)
 * 自动集成所有业务逻辑 (播放、队列、收藏、删除等)。
 */
export default function SmartMusicContextMenu(props: SmartMusicContextMenuProps) {
    const {
        items, context, playlistId,
        className, buttonClassName, variant, onOpen,
        onPlay, onDelete, onShuffle, onSelect, hideSelect, selectText, isSelected
    } = props;

    const normalizedItems = Array.isArray(items) ? items : [items];

    const { menuItems } = useSongOperations({
        items: normalizedItems,
        context,
        playlistId,
        onPlay,
        onDelete,
        onShuffle,
        onSelect,
        hideSelect,
        selectText,
        isSelected
    });

    return (
        <MusicContextMenu
            groups={menuItems}
            className={className}
            buttonClassName={buttonClassName}
            variant={variant}
            onOpen={onOpen}
        />
    );
}
