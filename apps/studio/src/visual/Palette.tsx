import { PALETTE, type PaletteKind } from "./editorModel";

export function Palette({ onAdd }: { onAdd: (kind: PaletteKind) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE.map((item) => (
        <button
          key={item.kind}
          title={item.hint}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/lw-kind", item.kind);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => onAdd(item.kind)}
          className="group flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 transition hover:border-indigo-400/50 hover:bg-indigo-500/10 hover:text-white active:scale-95"
        >
          <span className="grid h-4 w-5 place-items-center rounded bg-white/10 font-mono text-[9px] text-indigo-300">
            {item.icon}
          </span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
