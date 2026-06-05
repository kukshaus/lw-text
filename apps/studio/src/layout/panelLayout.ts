export type PanelId = "explorer" | "editor" | "center" | "sidebar";

export const PANEL_IDS: PanelId[] = ["explorer", "editor", "center", "sidebar"];

export interface PanelLayout {
  sizes: Record<PanelId, number>;
  hidden: Record<PanelId, boolean>;
}

export const DEFAULT_LAYOUT: PanelLayout = {
  sizes: { explorer: 16, editor: 28, center: 36, sidebar: 20 },
  hidden: { explorer: false, editor: false, center: false, sidebar: false },
};

const STORAGE_KEY = "lw-studio-layout-v2";
const MIN_PERCENT = 10;

export function loadLayout(): PanelLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<PanelLayout>;
    return {
      sizes: { ...DEFAULT_LAYOUT.sizes, ...parsed.sizes },
      hidden: { ...DEFAULT_LAYOUT.hidden, ...parsed.hidden },
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: PanelLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // ignore quota / private mode
  }
}

export function visiblePanels(hidden: Record<PanelId, boolean>): PanelId[] {
  return PANEL_IDS.filter((id) => !hidden[id]);
}

/** Normalize visible panel sizes to sum to 100. */
export function normalizeSizes(sizes: Record<PanelId, number>, hidden: Record<PanelId, boolean>): Record<PanelId, number> {
  const visible = visiblePanels(hidden);
  if (visible.length === 0) return { ...sizes };

  const total = visible.reduce((sum, id) => sum + sizes[id], 0);
  if (total <= 0) {
    const even = 100 / visible.length;
    return PANEL_IDS.reduce(
      (acc, id) => {
        acc[id] = hidden[id] ? sizes[id] : even;
        return acc;
      },
      {} as Record<PanelId, number>,
    );
  }

  return PANEL_IDS.reduce(
    (acc, id) => {
      acc[id] = hidden[id] ? sizes[id] : (sizes[id] / total) * 100;
      return acc;
    },
    {} as Record<PanelId, number>,
  );
}

export function clampPair(
  left: number,
  right: number,
  delta: number,
): { left: number; right: number } {
  let nextLeft = left + delta;
  let nextRight = right - delta;
  if (nextLeft < MIN_PERCENT) {
    nextRight -= MIN_PERCENT - nextLeft;
    nextLeft = MIN_PERCENT;
  }
  if (nextRight < MIN_PERCENT) {
    nextLeft -= MIN_PERCENT - nextRight;
    nextRight = MIN_PERCENT;
  }
  return { left: nextLeft, right: nextRight };
}

export function panelLabel(id: PanelId): string {
  switch (id) {
    case "explorer":
      return "Explorer";
    case "editor":
      return "Code";
    case "center":
      return "Preview";
    case "sidebar":
      return "Panel";
  }
}
