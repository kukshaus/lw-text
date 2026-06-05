import { useCallback, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import { toPx, type BoxSize } from "./boxStyle";

export interface ResizeHandlesProps {
  /** Element measured at drag start (bounding box). */
  measureRef: RefObject<HTMLElement | null>;
  /** Where to apply live px styles during drag (defaults to measureRef). */
  applyRef?: RefObject<HTMLElement | null>;
  /** Called once on pointer up with the final size (updates document model). */
  onResize: (patch: Partial<BoxSize>) => void;
  /** When true, corner drag keeps aspect ratio unless Shift is held. */
  lockRatioDefault?: boolean;
}

function applyLiveSize(el: HTMLElement, patch: Partial<BoxSize>) {
  if (patch.width) el.style.width = patch.width;
  if (patch.height) el.style.height = patch.height;
}

/** Canvas resize handles — live DOM updates during drag; one model commit on release. */
export function ResizeHandles({
  measureRef,
  applyRef,
  onResize,
  lockRatioDefault = false,
}: ResizeHandlesProps) {
  const startResize = useCallback(
    (mode: "corner" | "e" | "s", e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const measureEl = measureRef.current;
      const applyEl = (applyRef ?? measureRef).current;
      if (!measureEl || !applyEl) return;

      const rect = measureEl.getBoundingClientRect();
      const startW = rect.width;
      const startH = rect.height;
      const ratio = startH > 0 ? startW / startH : 1;
      const startX = e.clientX;
      const startY = e.clientY;
      const lockRatio = mode === "corner" && (lockRatioDefault ? !e.shiftKey : e.shiftKey);

      const prevWidth = applyEl.style.width;
      const prevHeight = applyEl.style.height;
      let lastPatch: Partial<BoxSize> | null = null;
      let raf = 0;

      const onMove = (ev: PointerEvent) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const dw = ev.clientX - startX;
          const dh = ev.clientY - startY;
          let w = startW + (mode === "s" ? 0 : dw);
          let h = startH + (mode === "e" ? 0 : dh);
          if (lockRatio && mode === "corner") {
            w = startW + dw;
            h = w / ratio;
          }
          const patch: Partial<BoxSize> = { width: toPx(w) };
          if (mode !== "e" || !lockRatio) {
            patch.height = toPx(h);
          }
          lastPatch = patch;
          applyLiveSize(applyEl, patch);
        });
      };

      const onUp = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        applyEl.style.width = prevWidth;
        applyEl.style.height = prevHeight;
        if (lastPatch) onResize(lastPatch);
      };

      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [measureRef, applyRef, onResize, lockRatioDefault],
  );

  return (
    <>
      <span
        className="lw-resize lw-resize-se"
        title={
          lockRatioDefault
            ? "Drag to resize (Shift = free aspect)"
            : "Drag to resize (Shift = lock aspect)"
        }
        onPointerDown={(e) => startResize("corner", e)}
      />
      <span className="lw-resize lw-resize-e" title="Width" onPointerDown={(e) => startResize("e", e)} />
      <span className="lw-resize lw-resize-s" title="Height" onPointerDown={(e) => startResize("s", e)} />
    </>
  );
}
