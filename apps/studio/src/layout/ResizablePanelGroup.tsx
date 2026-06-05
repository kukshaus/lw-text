import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  clampPair,
  normalizeSizes,
  panelLabel,
  saveLayout,
  visiblePanels,
  type PanelId,
  type PanelLayout,
} from "./panelLayout";

export interface ResizablePanelProps {
  id: PanelId;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ResizablePanel(_props: ResizablePanelProps) {
  return null;
}

interface PanelGroupProps {
  layout: PanelLayout;
  onLayoutChange: (layout: PanelLayout) => void;
  children: ReactNode;
}

export function ResizablePanelGroup({ layout, onLayoutChange, children }: PanelGroupProps) {
  const panels = collectPanels(children);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ left: PanelId; right: PanelId } | null>(null);

  const sizes = normalizeSizes(layout.sizes, layout.hidden);
  const visible = visiblePanels(layout.hidden);

  const updateLayout = useCallback(
    (next: PanelLayout) => {
      const normalized = {
        ...next,
        sizes: normalizeSizes(next.sizes, next.hidden),
      };
      onLayoutChange(normalized);
      saveLayout(normalized);
    },
    [onLayoutChange],
  );

  const togglePanel = useCallback(
    (id: PanelId) => {
      const hidden = { ...layout.hidden, [id]: !layout.hidden[id] };
      if (visiblePanels(hidden).length === 0) return;
      updateLayout({ ...layout, hidden });
    },
    [layout, updateLayout],
  );

  const startResize = useCallback(
    (left: PanelId, right: PanelId) => (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const startX = e.clientX;
      const startLeft = sizes[left];
      const startRight = sizes[right];
      setDragging({ left, right });

      const onMove = (ev: MouseEvent) => {
        const width = container.getBoundingClientRect().width;
        if (width <= 0) return;
        const delta = ((ev.clientX - startX) / width) * 100;
        const pair = clampPair(startLeft, startRight, delta);
        updateLayout({
          ...layout,
          sizes: { ...layout.sizes, [left]: pair.left, [right]: pair.right },
        });
      };

      const onUp = () => {
        setDragging(null);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [layout, sizes, updateLayout],
  );

  useEffect(() => {
    if (!dragging) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  const resetSizes = () =>
    updateLayout({
      ...layout,
      sizes: normalizeSizes({ explorer: 16, editor: 28, center: 36, sidebar: 20 }, layout.hidden),
    });

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden">
      {(["explorer", "editor", "center", "sidebar"] as PanelId[]).map((id) => {
        const panel = panels[id];
        if (!panel) return null;

        if (layout.hidden[id]) {
          return <CollapsedStrip key={id} id={id} onExpand={() => togglePanel(id)} />;
        }

        const idx = visible.indexOf(id);
        const nextVisible = idx >= 0 ? visible[idx + 1] : undefined;

        return (
          <section
            key={id}
              className={`relative flex min-h-0 min-w-0 flex-col border-white/5 ${panel.className ?? ""} ${
                id !== "sidebar" ? "border-r" : ""
              } ${id === "explorer" ? "bg-[#0b0d12]" : ""}`}
            style={{ flex: `${sizes[id]} 1 0%` }}
          >
            <div className="flex shrink-0 items-center gap-1 border-b border-white/5 bg-[#0e1118]">
              <div className="min-w-0 flex-1">{panel.header}</div>
              <button
                type="button"
                onClick={() => togglePanel(id)}
                title={`Hide ${panelLabel(id)} panel`}
                className="mr-2 shrink-0 rounded p-1 text-white/30 transition hover:bg-white/10 hover:text-white/80"
              >
                <HideIcon />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{panel.children}</div>

            {nextVisible && (
              <ResizeHandle
                active={dragging?.left === id && dragging.right === nextVisible}
                onMouseDown={startResize(id, nextVisible)}
                onDoubleClick={resetSizes}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

function collectPanels(children: ReactNode): Partial<Record<PanelId, ResizablePanelProps>> {
  const out: Partial<Record<PanelId, ResizablePanelProps>> = {};
  for (const child of Array.isArray(children) ? children : [children]) {
    if (!child || typeof child !== "object" || !("props" in child)) continue;
    const props = (child as { props: ResizablePanelProps }).props;
    if (props?.id) out[props.id] = props;
  }
  return out;
}

function CollapsedStrip({ id, onExpand }: { id: PanelId; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Show ${panelLabel(id)} panel`}
      className="group flex w-7 shrink-0 flex-col items-center justify-center gap-2 border-r border-white/5 bg-[#0b0d12] text-white/35 transition hover:bg-white/[0.04] hover:text-white/75"
    >
      <ShowIcon />
      <span
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
      >
        {panelLabel(id)}
      </span>
    </button>
  );
}

function ResizeHandle({
  active,
  onMouseDown,
  onDoubleClick,
}: {
  active: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · double-click to reset"
      className={`absolute right-0 top-0 z-20 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none select-none ${
        active ? "bg-indigo-500/20" : "hover:bg-indigo-500/15"
      }`}
    >
      <div
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition ${
          active ? "bg-indigo-400" : "bg-white/0 hover:bg-indigo-400/70"
        }`}
      />
    </div>
  );
}

function HideIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ShowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

/** Quick toggles for the top bar. */
export function PanelVisibilityToggles({
  layout,
  onToggle,
}: {
  layout: PanelLayout;
  onToggle: (id: PanelId) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-white/10 bg-white/5 p-0.5">
      {(["explorer", "editor", "center", "sidebar"] as PanelId[]).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onToggle(id)}
          title={layout.hidden[id] ? `Show ${panelLabel(id)}` : `Hide ${panelLabel(id)}`}
          className={`rounded px-2 py-1 text-xs font-medium transition ${
            layout.hidden[id]
              ? "text-white/30 line-through hover:text-white/55"
              : "bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30"
          }`}
        >
          {panelLabel(id)}
        </button>
      ))}
    </div>
  );
}
