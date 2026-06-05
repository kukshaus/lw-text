import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadUiPreferences,
  patchUiPreferences,
  type UiPreferences,
} from "./uiPreferences";

/** Boolean UI flag persisted in localStorage. */
export function usePersistedFlag(key: keyof Pick<UiPreferences, "versionHistoryExpanded" | "workspaceExplorerOpen">) {
  const [value, setValue] = useState(() => loadUiPreferences()[key]);
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      patchUiPreferences({ [key]: next });
    },
    [key],
  );
  const toggle = useCallback(() => {
    setValue((prev) => {
      const next = !prev;
      patchUiPreferences({ [key]: next });
      return next;
    });
  }, [key]);
  return [value, set, toggle] as const;
}

/** Explorer expand/collapse maps — debounced save. */
export function usePersistedExplorerTree() {
  const initial = useRef(loadUiPreferences()).current;
  const [workspaceOpen, setWorkspaceOpen] = useState(initial.workspaceExplorerOpen);
  const [expandedProjects, setExpandedProjects] = useState(initial.explorerExpandedProjects);
  const [expandedFolders, setExpandedFolders] = useState(initial.explorerExpandedFolders);

  useEffect(() => {
    const t = window.setTimeout(() => {
      patchUiPreferences({
        workspaceExplorerOpen: workspaceOpen,
        explorerExpandedProjects: expandedProjects,
        explorerExpandedFolders: expandedFolders,
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [workspaceOpen, expandedProjects, expandedFolders]);

  return {
    workspaceOpen,
    setWorkspaceOpen,
    expandedProjects,
    setExpandedProjects,
    expandedFolders,
    setExpandedFolders,
  };
}
