import { useEffect, useMemo, useRef, useState } from "react";
import { api, type FontInfo } from "../api";

const SYSTEM_FONTS = [
  "inherit",
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  "Arial, Helvetica, sans-serif",
  "'Times New Roman', Times, serif",
  "'Courier New', Courier, monospace",
  "Georgia, serif",
  "Verdana, Geneva, sans-serif",
];

export function FontField({
  pid,
  family,
  onFamily,
}: {
  pid: string;
  family: string;
  onFamily: (value: string) => void;
}) {
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    const custom = fonts.map((f) => `"${f.family}", var(--font-sans, sans-serif)`);
    return [...SYSTEM_FONTS, ...custom];
  }, [fonts]);

  useEffect(() => {
    if (!pid) return;
    api.fonts(pid).then(setFonts).catch(() => setFonts([]));
  }, [pid]);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const font = await api.uploadFont(pid, file);
      const nextFamily = `"${font.family}", var(--font-sans, sans-serif)`;
      onFamily(nextFamily);
      setFonts((prev) => [...prev.filter((f) => f.name !== font.name), font].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(font: FontInfo) {
    if (!window.confirm(`Delete font "${font.family}"?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteFont(pid, font.name);
      setFonts((prev) => prev.filter((f) => f.name !== font.name));
      if (family.includes(font.family)) onFamily("inherit");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>Font family</Label>
      <select
        value={family || "inherit"}
        onChange={(e) => onFamily(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none focus:border-indigo-400/50"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-indigo-500/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Upload font
        </button>
        <span className="text-[11px] text-white/40">WOFF2/WOFF/TTF/OTF</span>
      </div>
      {fonts.length > 0 && (
        <ul className="space-y-1">
          {fonts.map((f) => {
            const value = `"${f.family}", var(--font-sans, sans-serif)`;
            return (
              <li key={f.name} className="flex items-center gap-2 rounded border border-white/10 bg-white/[0.03] px-2 py-1">
                <button
                  type="button"
                  onClick={() => onFamily(value)}
                  className="flex-1 truncate text-left text-xs text-white/80 hover:text-indigo-200"
                  title={f.name}
                  style={{ fontFamily: value }}
                >
                  {f.family}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(f)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/20"
                  title={`Delete ${f.name}`}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {err && <p className="text-xs text-rose-300">{err}</p>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-white/35">{children}</label>;
}
