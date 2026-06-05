import { useRef, type CSSProperties, type ReactNode, type MouseEvent } from "react";
import { ResizeHandles } from "./ResizeHandles";
import { boxSizeToCss, parseBoxSize, type BoxSize } from "./boxStyle";

export interface ResizableBlockProps {
  selected: boolean;
  styleStr?: string;
  className?: string;
  onSelect: (e: MouseEvent) => void;
  onResize: (patch: Partial<BoxSize>) => void;
  children: ReactNode;
}

/** Wraps a block element so canvas resize handles can set width/height/min-height. */
export function ResizableBlock({
  selected,
  styleStr,
  className,
  onSelect,
  onResize,
  children,
}: ResizableBlockProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const size = parseBoxSize(styleStr);
  const hostStyle: CSSProperties = {
    position: "relative",
    display: "block",
    ...boxSizeToCss(size, { fillHost: !size.width }),
  };

  return (
    <div
      ref={hostRef}
      className={`lw-resize-host${selected ? " lw-resize-host-sel" : ""}${className ? ` ${className}` : ""}`}
      style={hostStyle}
      onClick={onSelect}
    >
      {children}
      {selected && <ResizeHandles measureRef={hostRef} onResize={onResize} lockRatioDefault={false} />}
    </div>
  );
}
