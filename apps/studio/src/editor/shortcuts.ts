/** macOS vs Windows/Linux modifier labels for tooltips. */
export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator as Navigator & { userAgentData?: { platform?: string } };
  return (
    /Mac|iPhone|iPod|iPad/i.test(navigator.platform) || ua.userAgentData?.platform === "macOS"
  );
}

export function modKeyLabel(): string {
  return isMacOS() ? "⌘" : "Ctrl";
}

/** Human-readable shortcut, e.g. ⌘S or Ctrl+S */
export function shortcutLabel(key: string, opts?: { shift?: boolean }): string {
  const k = key.length === 1 ? key.toUpperCase() : key;
  if (isMacOS()) {
    return opts?.shift ? `${modKeyLabel()}⇧${k}` : `${modKeyLabel()}${k}`;
  }
  return opts?.shift ? `${modKeyLabel()}+Shift+${k}` : `${modKeyLabel()}+${k}`;
}

export function isModKey(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

export function isSaveShortcut(e: KeyboardEvent): boolean {
  return isModKey(e) && !e.altKey && e.key.toLowerCase() === "s";
}

export function isUndoShortcut(e: KeyboardEvent): boolean {
  return isModKey(e) && !e.altKey && e.key.toLowerCase() === "z" && !e.shiftKey;
}

export function isRedoShortcut(e: KeyboardEvent): boolean {
  if (!isModKey(e) || e.altKey) return false;
  const k = e.key.toLowerCase();
  return (e.shiftKey && k === "z") || k === "y";
}
