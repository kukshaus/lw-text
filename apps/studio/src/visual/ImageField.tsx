import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AssetInfo } from "../api";
import { isAssetPath, isExpressionSrc, resolveImageSrc } from "./imageAssets";

export interface ImageFieldProps {
  pid: string;
  src: string;
  alt: string;
  onSrc: (v: string) => void;
  onAlt: (v: string) => void;
}

export function ImageField({ pid, src, alt, onSrc, onAlt }: ImageFieldProps) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exprMode, setExprMode] = useState(() => isExpressionSrc(src));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExprMode(isExpressionSrc(src));
  }, [src]);

  const refresh = useCallback(() => {
    if (!pid) return;
    api.assets(pid).then(setAssets).catch(() => setAssets([]));
  }, [pid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const previewSrc = exprMode || !src ? "" : resolveImageSrc(pid, src);

  const maxBytes = 8 * 1024 * 1024;

  async function upload(file: File) {
    if (!pid) return;
    if (file.size > maxBytes) {
      setErr(`Image must be under ${maxBytes / (1024 * 1024)} MB (this file is ${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const asset = await api.uploadAsset(pid, file);
      onSrc(asset.path);
      setExprMode(false);
      refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(name: string) {
    if (!pid) return;
    if (!window.confirm(`Delete "${name}" from the project? Templates using it will show a broken image.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteAsset(pid, name);
      if (isAssetPath(src) && src.endsWith(name)) onSrc("");
      refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Image source</Label>
        <label className="flex items-center gap-1.5 text-[10px] text-white/50">
          <input
            type="checkbox"
            checked={exprMode}
            onChange={(e) => setExprMode(e.target.checked)}
            className="accent-indigo-500"
          />
          Data expression
        </label>
      </div>

      {exprMode ? (
        <textarea
          defaultValue={src}
          rows={2}
          placeholder='{{ DATA.brand.logoUrl }}'
          onBlur={(e) => onSrc(e.target.value)}
          className={inputCls + " font-mono"}
        />
      ) : (
        <>
          <div
            className={`relative flex min-h-[88px] items-center justify-center overflow-hidden rounded-lg border border-dashed ${
              busy ? "border-indigo-400/40 bg-indigo-500/5" : "border-white/15 bg-white/[0.03]"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("border-indigo-400/50");
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove("border-indigo-400/50")}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-indigo-400/50");
              const file = e.dataTransfer.files[0];
              if (file) void upload(file);
            }}
          >
            {previewSrc ? (
              <img src={previewSrc} alt={alt || "preview"} className="max-h-28 max-w-full object-contain p-2" />
            ) : (
              <span className="px-3 text-center text-xs text-white/35">No image — upload or pick below</span>
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white/80">
                Uploading…
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif,.ico"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap gap-1.5">
            <Btn primary disabled={busy} onClick={() => inputRef.current?.click()}>
              {src && isAssetPath(src) ? "Replace" : "Upload"}
            </Btn>
            {src && (
              <Btn disabled={busy} onClick={() => onSrc("")}>
                Remove
              </Btn>
            )}
          </div>

          <div>
            <Label>Or enter URL / path</Label>
            <input
              key={src}
              defaultValue={src}
              placeholder="assets/logo.png or https://…"
              onBlur={(e) => onSrc(e.target.value.trim())}
              className={inputCls + " font-mono"}
            />
          </div>

          {assets.length > 0 && (
            <div>
              <Label>Project assets</Label>
              <ul className="grid grid-cols-3 gap-1.5">
                {assets.map((a) => (
                  <li key={a.name} className="group relative">
                    <button
                      type="button"
                      title={a.name}
                      onClick={() => onSrc(a.path)}
                      className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-white/5 p-1 transition hover:border-indigo-400/50 ${
                        src === a.path ? "border-indigo-400 ring-1 ring-indigo-400/40" : "border-white/10"
                      }`}
                    >
                      <img
                        src={resolveImageSrc(pid, a.path)}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                      />
                    </button>
                    <button
                      type="button"
                      title={`Delete ${a.name}`}
                      onClick={() => void removeAsset(a.name)}
                      className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] text-white group-hover:flex"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div>
        <Label>Alt text</Label>
        <input
          defaultValue={alt}
          placeholder="Describe the image for accessibility"
          onBlur={(e) => onAlt(e.target.value)}
          className={inputCls}
        />
      </div>

      {err && <p className="text-xs text-rose-300">{err}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none focus:border-indigo-400/50";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-white/35">{children}</label>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
        primary
          ? "bg-indigo-500/80 text-white hover:bg-indigo-500"
          : "border border-white/10 text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
