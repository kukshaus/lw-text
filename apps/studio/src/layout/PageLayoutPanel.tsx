import {
  DEFAULT_PAGE_LAYOUT,
  PAGE_FORMAT_SPECS,
  PAGE_MARGIN_PRESETS,
  pageLayoutLabel,
  type PageFormat,
  type PageLayoutSettings,
  type PageOrientation,
} from "@lw-text/engine";

export function PageLayoutPanel({
  settings,
  onChange,
  onApply,
}: {
  settings: PageLayoutSettings;
  onChange: (s: PageLayoutSettings) => void;
  onApply: () => void;
}) {
  const set = <K extends keyof PageLayoutSettings>(k: K, v: PageLayoutSettings[K]) =>
    onChange({ ...settings, [k]: v });

  const applyMarginPreset = (id: string) => {
    const preset = PAGE_MARGIN_PRESETS.find((p) => p.id === id);
    if (preset) onChange({ ...settings, ...preset.margins });
  };

  const activeMarginPreset =
    PAGE_MARGIN_PRESETS.find(
      (p) =>
        p.margins.marginTopMm === settings.marginTopMm &&
        p.margins.marginRightMm === settings.marginRightMm &&
        p.margins.marginBottomMm === settings.marginBottomMm &&
        p.margins.marginLeftMm === settings.marginLeftMm,
    )?.id ?? "custom";

  return (
    <div className="border-b border-white/5">
      <div className="bg-gradient-to-br from-violet-950/50 via-[#0b0d12] to-indigo-950/30 p-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-200/90">
              Page layout
            </h3>
            <p className="mt-0.5 text-[10px] text-white/40">{pageLayoutLabel(settings)}</p>
          </div>
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30">
            Pro
          </span>
        </div>
        <button
          onClick={onApply}
          className="w-full rounded-md border border-violet-400/40 bg-violet-500/15 px-2 py-1.5 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-500/25"
        >
          Apply to template
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-white/35">
            Paper size
          </label>
          <div className="grid grid-cols-3 gap-1">
            {PAGE_FORMAT_SPECS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => set("format", f.id as PageFormat)}
                className={`rounded-md border px-1.5 py-1.5 text-[10px] font-medium transition ${
                  settings.format === f.id
                    ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                    : "border-white/10 bg-white/5 text-white/55 hover:border-white/20 hover:text-white/80"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-white/35">
            Orientation
          </label>
          <div className="inline-flex w-full rounded-md border border-white/10 bg-white/5 p-0.5">
            {(["portrait", "landscape"] as PageOrientation[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => set("orientation", o)}
                className={`flex-1 rounded px-2 py-1.5 text-[10px] font-medium capitalize transition ${
                  settings.orientation === o
                    ? "bg-violet-500/70 text-white shadow"
                    : "text-white/50 hover:text-white/85"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-white/35">
            Margins
          </label>
          <div className="mb-2 flex flex-wrap gap-1">
            {PAGE_MARGIN_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyMarginPreset(p.id)}
                className={`rounded px-2 py-0.5 text-[10px] transition ${
                  activeMarginPreset === p.id
                    ? "bg-white/15 text-white"
                    : "text-white/45 hover:bg-white/10 hover:text-white/75"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MarginInput label="Top" value={settings.marginTopMm} onChange={(v) => set("marginTopMm", v)} />
            <MarginInput label="Right" value={settings.marginRightMm} onChange={(v) => set("marginRightMm", v)} />
            <MarginInput label="Bottom" value={settings.marginBottomMm} onChange={(v) => set("marginBottomMm", v)} />
            <MarginInput label="Left" value={settings.marginLeftMm} onChange={(v) => set("marginLeftMm", v)} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_PAGE_LAYOUT })}
          className="text-[10px] text-white/35 underline-offset-2 hover:text-white/60 hover:underline"
        >
          Reset to A4 standard
        </button>
      </div>
    </div>
  );
}

function MarginInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] text-white/35">{label} (mm)</span>
      <input
        type="number"
        min={0}
        max={50}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white/90 outline-none focus:border-violet-400/50"
      />
    </label>
  );
}
