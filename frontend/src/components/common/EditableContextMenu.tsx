import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MdContentCopy, MdContentCut, MdContentPaste, MdRedo, MdSelectAll, MdUndo } from 'react-icons/md';
import { readText } from '@tauri-apps/plugin-clipboard-manager';

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

interface FieldHistory {
    undo: string[];
    redo: string[];
    value: string;
}

const editableInputTypes = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);
const fieldHistories = new WeakMap<EditableElement, FieldHistory>();
const MAX_HISTORY_ENTRIES = 100;

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

function getElementValue(element: EditableElement) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value
        : element.textContent ?? '';
}

function getFieldHistory(element: EditableElement) {
    let history = fieldHistories.get(element);
    if (!history) {
        history = { undo: [], redo: [], value: getElementValue(element) };
        fieldHistories.set(element, history);
    }
    return history;
}

function getEditCommandAvailability(element: EditableElement): EditCommandAvailability {
    const history = getFieldHistory(element);
    return { undo: history.undo.length > 0, redo: history.redo.length > 0 };
}

function recordInputChange(element: EditableElement) {
    const history = getFieldHistory(element);
    const value = getElementValue(element);
    if (value === history.value) return;

    history.undo.push(history.value);
    if (history.undo.length > MAX_HISTORY_ENTRIES) history.undo.shift();
    history.redo = [];
    history.value = value;
}

function setElementValue(element: EditableElement, value: string) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        setter?.call(element, value);
    } else {
        element.textContent = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyHistoryCommand(command: 'undo' | 'redo', element: EditableElement) {
    const history = getFieldHistory(element);
    const source = command === 'undo' ? history.undo : history.redo;
    const target = command === 'undo' ? history.redo : history.undo;
    const previousValue = source.pop();
    if (previousValue === undefined) return false;

    target.push(history.value);
    history.value = previousValue;
    setElementValue(element, previousValue);
    return true;
}

function runEditCommand(command: 'cut' | 'copy' | 'selectAll', element: EditableElement) {
    element.focus();
    return document.execCommand(command);
}

async function pasteClipboardText(element: EditableElement) {
    element.focus();

    try {
        const text = await readText();
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            const start = element.selectionStart ?? element.value.length;
            const end = element.selectionEnd ?? start;
            element.setRangeText(text, start, end, 'end');
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }

        const selection = window.getSelection();
        if (!selection?.rangeCount) return false;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    } catch {
        // WebView may deny the Clipboard API; retain the native command as a fallback.
        return document.execCommand('paste');
    }
}

export default function EditableContextMenu() {
    const [menu, setMenu] = useState<ContextMenuState | null>(null);
    const [commandAvailability, setCommandAvailability] = useState<EditCommandAvailability>({ undo: false, redo: false });
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    const closeMenu = useCallback(() => setMenu(null), []);

    useEffect(() => {
        const initializeHistory = (event: FocusEvent) => {
            const element = getEditableElement(event.target);
            if (element) getFieldHistory(element);
        };
        const trackInput = (event: Event) => {
            const element = getEditableElement(event.target);
            if (element) recordInputChange(element);
        };
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

        document.addEventListener('focusin', initializeHistory, true);
        document.addEventListener('input', trackInput, true);
        document.addEventListener('contextmenu', handleContextMenu);
        return () => {
            document.removeEventListener('focusin', initializeHistory, true);
            document.removeEventListener('input', trackInput, true);
            document.removeEventListener('contextmenu', handleContextMenu);
        };
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
                            if (command === 'paste') {
                                void pasteClipboardText(menu.element);
                                closeMenu();
                                return;
                            }
                            if (command === 'undo' || command === 'redo') {
                                const changed = applyHistoryCommand(command, menu.element);
                                setCommandAvailability(getEditCommandAvailability(menu.element));
                                if (!changed) return;
                                closeMenu();
                                return;
                            }
                            runEditCommand(command, menu.element);
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
