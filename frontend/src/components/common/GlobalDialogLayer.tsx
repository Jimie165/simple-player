import ConfirmDialog from '@/components/common/ConfirmDialog';
import InfoDialog from '@/components/common/InfoDialog';
import EditSongDialog from '@/features/library/dialogs/song-edit/EditSongDialog';
import { useDialogStore } from '@/store/useDialogStore';

/**
 * 全局弹窗层
 * 负责渲染由 useDialogStore 控制的全局弹窗，如删除确认、属性查看等。
 * 将此组件放置在 App 的顶层，确保弹窗不会因为触发菜单的组件卸载而关闭。
 */
export default function GlobalDialogLayer() {
    const { deleteConfirm, closeDeleteConfirm, properties, closeProperties, editSong, closeEditSong } = useDialogStore();

    return (
        <>
            {/* 删除确认弹窗 */}
            <ConfirmDialog
                isOpen={deleteConfirm.isOpen}
                onClose={closeDeleteConfirm}
                onConfirm={deleteConfirm.onConfirm}
                title={deleteConfirm.title}
                description={deleteConfirm.description}
                confirmText={deleteConfirm.confirmText}
                type="danger"
            />

            {/* 属性详情弹窗 */}
            <InfoDialog
                isOpen={properties.isOpen}
                onClose={closeProperties}
                song={properties.song}
            />

            <EditSongDialog
                isOpen={editSong.isOpen}
                onClose={closeEditSong}
                song={editSong.song}
            />
        </>
    );
}
