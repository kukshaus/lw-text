export interface BindingMenuState {
  from: number;
  to: number;
  options: string[];
  index: number;
}

export function BindingAutocompleteMenu({
  menu,
  anchorRect,
  onPick,
}: {
  menu: BindingMenuState;
  anchorRect: DOMRect;
  onPick: (path: string) => void;
}) {
  if (!menu.options.length) return null;
  return (
    <ul
      role="listbox"
      className="fixed z-[300] max-h-36 min-w-[10rem] overflow-auto rounded-md border border-indigo-400/40 bg-[#151922] py-1 shadow-xl"
      style={{ left: anchorRect.left, top: anchorRect.bottom + 4 }}
    >
      {menu.options.map((opt, i) => (
        <li key={opt}>
          <button
            type="button"
            role="option"
            aria-selected={i === menu.index}
            className={`block w-full px-2 py-1 text-left font-mono text-[11px] ${
              i === menu.index ? "bg-indigo-500/30 text-indigo-100" : "text-white/85 hover:bg-white/5"
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(opt);
            }}
          >
            {opt}
          </button>
        </li>
      ))}
    </ul>
  );
}
