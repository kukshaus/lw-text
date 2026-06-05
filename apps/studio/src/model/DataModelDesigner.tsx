import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { shortcutLabel } from "../editor/shortcuts";
import CodeMirror from "@uiw/react-codemirror";
import { json as cmJson } from "@codemirror/lang-json";
import { api, type Diagnostic, type JsonSchema } from "../api";
import { SchemaNode } from "./SchemaTree";

export interface DataModelDesignerProps {
  pid: string;
  schemaNames: string[];
  /** Controlled datasource name (optional). */
  schemaName?: string;
  onSchemaName?: (name: string) => void;
  /** The current authoring payload, used to seed the example for each datasource. */
  sampleData: Record<string, unknown> | null;
  /** Wired to global ⌘S / Ctrl+S from App. */
  saveHandlerRef?: RefObject<(() => void) | null>;
  onToast: (msg: string) => void;
}

export function DataModelDesigner({
  pid,
  schemaNames,
  schemaName,
  onSchemaName,
  sampleData,
  saveHandlerRef,
  onToast,
}: DataModelDesignerProps) {
  const names = schemaNames.length ? schemaNames : ["DATA"];
  const [name, setName] = useState(schemaName ?? names[0]!);

  useEffect(() => {
    if (schemaName && schemaName !== name) setName(schemaName);
  }, [schemaName, name]);
  const [schema, setSchema] = useState<JsonSchema | null>(null);
  const [sampleText, setSampleText] = useState("{}");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load schema + seed example whenever the project/datasource changes.
  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .schema(pid, name)
      .then((res) => alive && setSchema(res.schema))
      .catch((e: Error) => alive && (setSchema({ type: "object", properties: {} }), setError(e.message)));
    const seed = sampleData?.[name];
    setSampleText(JSON.stringify(seed ?? {}, null, 2));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, name]);

  const sample = useMemo(() => {
    try {
      return JSON.parse(sampleText || "{}");
    } catch {
      return undefined;
    }
  }, [sampleText]);

  const sampleValid = sample !== undefined;

  // Live-validate the example against the working schema (debounced).
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!schema || !sampleValid) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api
        .checkSchema(pid, schema, sample, name)
        .then((r) => setDiagnostics(r.diagnostics))
        .catch(() => setDiagnostics([]));
    }, 350);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [pid, name, schema, sample, sampleValid]);

  const infer = useCallback(async () => {
    if (!sampleValid) return;
    try {
      const inferred = await api.inferSchema(pid, sample, {
        title: name,
        rootId: typeof schema?.$id === "string" ? schema.$id : undefined,
        required: "present",
      });
      setSchema(inferred);
      setDirty(true);
      onToast(`Inferred ${name} model from example JSON`);
    } catch (e) {
      onToast((e as Error).message);
    }
  }, [pid, name, sample, sampleValid, schema, onToast]);

  const save = useCallback(async () => {
    if (!schema) return;
    setSaving(true);
    try {
      const res = await api.saveSchema(pid, name, schema);
      setDirty(false);
      onToast(`Saved data model → ${res.path}`);
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [pid, name, schema, onToast]);

  useEffect(() => {
    if (!saveHandlerRef) return;
    saveHandlerRef.current = () => {
      void save();
    };
    return () => {
      saveHandlerRef.current = null;
    };
  }, [save, saveHandlerRef]);

  const update = useCallback((next: JsonSchema) => {
    setSchema(next);
    setDirty(true);
  }, []);

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
      {/* Example JSON (JSON-first) */}
      <section className="flex min-h-0 flex-col border-r border-white/5 bg-[#0e1118]">
        <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2 text-xs">
          <span className="font-semibold text-white/70">Example data</span>
          <span className="text-white/30">JSON-first — paste a real payload, then infer the model</span>
          {!sampleValid && <span className="ml-auto text-rose-400">invalid JSON</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeMirror value={sampleText} height="100%" theme="dark" extensions={[cmJson()]} onChange={setSampleText} />
        </div>
      </section>

      {/* Schema builder */}
      <section className="flex min-h-0 flex-col bg-[#0b0d12]">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-3 py-2 text-xs">
          <span className="font-semibold text-white/70">Data model</span>
          {names.length > 1 && (
            <select
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                onSchemaName?.(e.target.value);
              }}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/80 outline-none"
            >
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">{name}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={infer}
              disabled={!sampleValid}
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-medium text-white/80 transition hover:border-indigo-400/50 hover:text-white disabled:opacity-40"
              title="Generate the model from the example JSON"
            >
              ⤵ Infer from JSON
            </button>
            <button
              onClick={() => void save()}
              disabled={saving || !schema}
              title={`Save schema (${shortcutLabel("s")})`}
              className="rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 px-3 py-1 font-semibold text-white shadow transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Saving…" : dirty ? "Save model ●" : "Save model"}
            </button>
          </div>
        </div>

        {error && <div className="bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">{error} — start a new model below.</div>}

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {schema ? <SchemaNode schema={schema} onChange={update} /> : <p className="text-sm text-white/40">Loading…</p>}
        </div>

        {/* Validation footer */}
        <div className="border-t border-white/5 px-3 py-2 text-xs">
          {!sampleValid ? (
            <span className="text-white/40">Fix the example JSON to validate it against the model.</span>
          ) : errorCount === 0 ? (
            <span className="text-emerald-300">✓ Example matches the model.</span>
          ) : (
            <ul className="max-h-28 space-y-1 overflow-auto">
              {diagnostics.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-rose-300">{d.path ?? "(root)"}</span>
                  <span className="text-white/55">{d.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
