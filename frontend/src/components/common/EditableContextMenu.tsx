import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MdContentCopy, MdContentCut, MdContentPaste, MdRedo, MdSelectAll, MdUndo } from 'react-icons/md';

type EditableElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

interface ContextMenuState {
    x: number;
    y: number;
    element: EditableElement;
}

interface EditCommandAvailability {
    undo: boolean;
    redo: boolean;
}

const editableInputTypes = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

function getEditableElement(target: EventTarget | null): EditableElement | null {
    if (!(target instanceof Element)) return null;

    const element = target.closest('input, textarea, [contenteditable="true"]');
    if (!element || element instanceof HTMLInputElement && !editableInputTypes.has(element.type)) return null;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.disabled ? null : element;
    }
    return element instanceof HTMLElement && element.isContentEditable ? element : null;
}

function hasSelection(element: EditableElement) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.selectionStart !== element.selectionEnd;
    }
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && element.contains(selection.anchorNode));
}

function isReadOnly(element: EditableElement) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.readOnly
        : !element.isContentEditable;
}

function getEditCommandAvailability(element: EditableElement): EditCommandAvailability {
    element.focus();
    return {
        undo: document.queryCommandEnabled('undo'),
        redo: document.queryCommandEnabled('redo'),
    };
}

function runEditCommand(command: 'cut' | 'copy' | 'paste' | 'selectAll' | 'undo' | 'redo', element: EditableElement) {
    element.focus();
    return document.execCommand(command);
}

export default function EditableContextMenu() {
    const [menu, setMenu] = useState<ContextMenuState | null>(null);
    const [commandAvailability, setCommandAvailability] = useState<EditCommandAvailability>({ undo: false, redo: false });
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    const closeMenu = useCallback(() => setMenu(null), []);

    useEffect(() => {
        const handleContextMenu = (event: MouseEvent) => {
            const element = getEditableElement(event.target);
            if (!element) {
                event.preventDefault();
                return;
            }

            event.preventDefault();
            element.focus();
            setCommandAvailability(getEditCommandAvailability(element));
            setMenu({ x: event.clientX, y: event.clientY, element });
        };

        document.addEventListener('contextmenu', handleContextMenu);
        return () => document.removeEventListener('contextmenu', handleContextMenu);
    }, []);

    useEffect(() => {
        if (!menu || !menuRef.current) return;

        const rect = menuRef.current.getBoundingClientRect();
        setPosition({
            left: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)),
        });
    }, [menu]);

    useEffect(() => {
        if (!menu) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) closeMenu();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeMenu();
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', closeMenu);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', closeMenu);
        };
    }, [menu, closeMenu]);

    if (!menu) return null;

    const readOnly = isReadOnly(menu.element);
    const selected = hasSelection(menu.element);
    const items = [
        { label: '撤销', icon: MdUndo, command: 'undo' as const, disabled: readOnly || !commandAvailability.undo },
        { label: '重做', icon: MdRedo, command: 'redo' as const, disabled: readOnly || !commandAvailability.redo },
        { label: '剪切', icon: MdContentCut, command: 'cut' as const, disabled: readOnly || !selected },
        { label: '复制', icon: MdContentCopy, command: 'copy' as const, disabled: !selected },
        { label: '粘贴', icon: MdContentPaste, command: 'paste' as const, disabled: readOnly },
        { label: '全选', icon: MdSelectAll, command: 'selectAll' as const, disabled: false },
    ];

    return createPortal(
        <div
            ref={menuRef}
            className="fixed z-9999 w-40 rounded-xl border border-neutral-200/30 bg-white/90 p-1 text-sm text-neutral-900 shadow-2xl backdrop-blur-3xl dark:border-white/10 dark:bg-neutral-900/90 dark:text-white"
            style={position}
            role="menu"
            onContextMenu={(event) => event.preventDefault()}
        >
            {items.map(({ label, icon: Icon, command, disabled }, index) => (
                <div key={command}>
                    {index === 2 && <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />}
                    <button
                        type="button"
                        role="menuitem"
                        disabled={disabled}
                        onClick={() => {
                            const changed = runEditCommand(command, menu.element);
                            if (command === 'undo' || command === 'redo') {
                                setCommandAvailability(getEditCommandAvailability(menu.element));
                                if (!changed) return;
                            }
                            closeMenu();
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
                    >
                        <Icon className="text-lg opacity-70" />
                        {label}
                    </button>
                </div>
            ))}
        </div>,
        document.body,
    );
}
