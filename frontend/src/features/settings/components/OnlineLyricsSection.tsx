import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { MdMenu } from 'react-icons/md';
import { SettingsGroup, SettingsRow, SettingsSwitch } from '@/features/settings/components/SettingsControls';
import { useOnlineLyricsSettingsStore } from '@/features/settings/useOnlineLyricsSettingsStore';
import { orderedLyricsProviders } from '@/services/onlineLyricsService';

function SourceRow({ id, label, index }: { id: string; label: string; index: number }) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
    return (
        <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'relative z-10 bg-surface shadow-md' : 'relative'}>
            <SettingsRow label={`${index + 1}. ${label}`}>
                <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label={`拖动调整${label}优先级`} className="cursor-grab touch-none rounded-md p-2 text-on-surface-variant transition-colors hover:bg-on-surface/10 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-primary">
                    <MdMenu className="text-xl" />
                </button>
            </SettingsRow>
        </div>
    );
}

export default function OnlineLyricsSection() {
    const autoFetchEnabled = useOnlineLyricsSettingsStore((state) => state.autoFetchEnabled);
    const setAutoFetchEnabled = useOnlineLyricsSettingsStore((state) => state.setAutoFetchEnabled);
    const order = useOnlineLyricsSettingsStore((state) => state.providerOrder);
    const setOrder = useOnlineLyricsSettingsStore((state) => state.setProviderOrder);
    const sources = orderedLyricsProviders(order);
    const ids = sources.map(([id]) => id);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const from = ids.findIndex(id => id === active.id);
        const to = ids.findIndex(id => id === over.id);
        if (from >= 0 && to >= 0) setOrder(arrayMove(ids, from, to));
    };
    return (
        <div className="space-y-7">
            <SettingsGroup title="自动获取歌词">
                <SettingsRow label="无自定义歌词时自动获取歌词" description="播放时自动查找并保存合适的歌词">
                    <SettingsSwitch label="无自定义歌词时自动获取歌词" checked={autoFetchEnabled} onChange={setAutoFetchEnabled} />
                </SettingsRow>
            </SettingsGroup>
            <SettingsGroup title="歌词来源优先级" footer="拖动右侧三横杠调整顺序，越靠上越优先。歌词不匹配时会换用其他来源。适用于手动搜索和自动获取。">
                <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onDragEnd}>
                    <div className="settings-row-dividers">
                        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                            {sources.map(([id, label], index) => <SourceRow key={id} id={id} label={label} index={index} />)}
                        </SortableContext>
                    </div>
                </DndContext>
            </SettingsGroup>
        </div>
    );
}
