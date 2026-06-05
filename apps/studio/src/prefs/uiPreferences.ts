import type { PanelLayout } from "../layout/panelLayout";
import { loadLayout, saveLayout } from "../layout/panelLayout";

/** Persisted Studio chrome — panels, collapses, explorer tree. */
export interface UiPreferences {
  versionHistoryExpanded: boolean;
  workspaceExplorerOpen: boolean;
  explorerExpandedProjects: Record<string, boolean>;
  explorerExpandedFolders: Record<string, Record<string, boolean>>;
}

const UI_KEY = "lw-studio-ui-v1";

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  versionHistoryExpanded: true,
  workspaceExplorerOpen: true,
  explorerExpandedProjects: {},
  explorerExpandedFolders: {},
};

export function loadUiPreferences(): UiPreferences {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return { ...DEFAULT_UI_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      versionHistoryExpanded:
        parsed.versionHistoryExpanded ?? DEFAULT_UI_PREFERENCES.versionHistoryExpanded,
      workspaceExplorerOpen:
        parsed.workspaceExplorerOpen ?? DEFAULT_UI_PREFERENCES.workspaceExplorerOpen,
      explorerExpandedProjects: {
        ...DEFAULT_UI_PREFERENCES.explorerExpandedProjects,
        ...parsed.explorerExpandedProjects,
      },
      explorerExpandedFolders: {
        ...DEFAULT_UI_PREFERENCES.explorerExpandedFolders,
        ...parsed.explorerExpandedFolders,
      },
    };
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function saveUiPreferences(prefs: UiPreferences): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(prefs));
  } catch {
    // private mode / quota
  }
}

export function patchUiPreferences(patch: Partial<UiPreferences>): UiPreferences {
  const next = { ...loadUiPreferences(), ...patch };
  saveUiPreferences(next);
  return next;
}

/** Panel sizes + hidden flags (separate legacy key, kept in sync on write). */
export function loadPersistedPanelLayout(): PanelLayout {
  return loadLayout();
}

export function savePersistedPanelLayout(layout: PanelLayout): void {
  saveLayout(layout);
}

export function loadAllStudioChrome(): { ui: UiPreferences; panels: PanelLayout } {
  return { ui: loadUiPreferences(), panels: loadPersistedPanelLayout() };
}
