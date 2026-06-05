import type { LwDocument, Node } from "@lw-text/engine";
import { childrenOf, isBindElement, nodeIcon, nodeLabel, samePath, type Path } from "./editorModel";

export interface StructureTreeProps {
  doc: LwDocument;
  selected: Path | null;
  onSelect: (path: Path) => void;
  onMove: (path: Path, dir: -1 | 1) => void;
  onDelete: (path: Path) => void;
}

export function StructureTree({ doc, selected, onSelect, onMove, onDelete }: StructureTreeProps) {
  return (
    <div className="p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Structure</h3>
      <ul className="space-y-0.5">
        <Rows nodes={doc.nodes} parentPath={[]} selected={selected} onSelect={onSelect} onMove={onMove} onDelete={onDelete} />
      </ul>
    </div>
  );
}

function Rows({ nodes, parentPath, selected, onSelect, onMove, onDelete }: { nodes: Node[]; parentPath: Path } & Omit<StructureTreeProps, "doc">) {
  return (
    <>
      {nodes.map((n, i) => {
        const path = [...parentPath, i];
        const kids = !isBindElement(n) ? childrenOf(n) : null;
        const isSel = samePath(selected, path);
        return (
          <li key={i}>
            <div
              onClick={(e) => { e.stopPropagation(); onSelect(path); }}
              className={`group flex items-center gap-1.5 rounded px-1.5 py-1 text-xs ${isSel ? "bg-indigo-500/20 text-white" : "text-white/65 hover:bg-white/5"}`}
              style={{ marginLeft: parentPath.length * 10 }}
            >
              <span className="grid h-4 w-4 place-items-center rounded bg-white/10 font-mono text-[9px] text-indigo-300">{nodeIcon(n)}</span>
              <span className="truncate font-mono">{nodeLabel(n)}</span>
              <span className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                <IconBtn title="Move up" onClick={(e) => { e.stopPropagation(); onMove(path, -1); }}>↑</IconBtn>
                <IconBtn title="Move down" onClick={(e) => { e.stopPropagation(); onMove(path, 1); }}>↓</IconBtn>
                <IconBtn title="Delete" danger onClick={(e) => { e.stopPropagation(); onDelete(path); }}>✕</IconBtn>
              </span>
            </div>
            {kids && kids.length > 0 && (
              <ul className="space-y-0.5">
                <Rows nodes={kids} parentPath={path} selected={selected} onSelect={onSelect} onMove={onMove} onDelete={onDelete} />
              </ul>
            )}
          </li>
        );
      })}
    </>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; title: string; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid h-4 w-4 place-items-center rounded text-[10px] hover:bg-white/15 ${danger ? "text-rose-400" : "text-white/50"}`}
    >
      {children}
    </button>
  );
}
