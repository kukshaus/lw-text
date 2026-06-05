import { useEffect } from "react";
import { isRedoShortcut, isSaveShortcut, isUndoShortcut } from "./shortcuts";

export interface GlobalShortcutHandlers {
  onSave: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

/**
 * OS-standard shortcuts (capture phase so CodeMirror does not swallow them).
 * Save: ⌘S / Ctrl+S · Undo: ⌘Z / Ctrl+Z · Redo: ⌘⇧Z / Ctrl+Y
 */
export function useGlobalShortcuts(handlers: GlobalShortcutHandlers, undoRedoEnabled = true): void {
  const { onSave, onUndo, onRedo } = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isSaveShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        onSave();
        return;
      }

      if (!undoRedoEnabled) return;

      if (isUndoShortcut(e) && onUndo) {
        e.preventDefault();
        e.stopPropagation();
        onUndo();
      } else if (isRedoShortcut(e) && onRedo) {
        e.preventDefault();
        e.stopPropagation();
        onRedo();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onSave, onUndo, onRedo, undoRedoEnabled]);
}
