import { useRef, type CSSProperties, type MouseEvent } from "react";
import { resolveImageSrc } from "./imageAssets";
import { ResizeHandles } from "./ResizeHandles";
import { boxSizeToCss, parseBoxSize, type BoxSize } from "./boxStyle";

export interface CanvasImageProps {
  pid: string;
  src: string;
  alt: string;
  styleStr?: string;
  className?: string;
  selected: boolean;
  onSelect: (e: MouseEvent) => void;
  onResize: (patch: Partial<BoxSize>) => void;
}

export function CanvasImage({
  pid,
  src,
  alt,
  styleStr,
  className,
  selected,
  onSelect,
  onResize,
}: CanvasImageProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const size = parseBoxSize(styleStr);
  const imgStyle: CSSProperties = {
    ...boxSizeToCss(size),
    maxWidth: size.maxWidth || undefined,
    objectFit: (size.objectFit as CSSProperties["objectFit"]) || undefined,
    display: "block",
  };

  return (
    <span
      ref={wrapRef}
      className={`lw-img-wrap${selected ? " lw-img-wrap-sel" : ""}`}
      onClick={onSelect}
      style={{ display: "inline-block", position: "relative", verticalAlign: "middle", maxWidth: "100%" }}
    >
      <img
        ref={imgRef}
        src={resolveImageSrc(pid, src)}
        alt={alt}
        className={className}
        style={imgStyle}
        draggable={false}
      />
      {selected && (
        <ResizeHandles measureRef={imgRef} applyRef={imgRef} onResize={onResize} lockRatioDefault />
      )}
    </span>
  );
}
