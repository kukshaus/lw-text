import { useState } from "react";
import type { JsonSchema } from "../api";
import {
  SCHEMA_TYPES,
  STRING_FORMATS,
  addProperty,
  isRequired,
  removeProperty,
  renameProperty,
  schemaForType,
  setKeyword,
  setProperty,
  setRequired,
  typeOf,
  type SchemaType,
} from "./schemaModel";

const TYPE_COLORS: Record<SchemaType, string> = {
  string: "text-emerald-300",
  number: "text-sky-300",
  integer: "text-sky-300",
  boolean: "text-amber-300",
  object: "text-violet-300",
  array: "text-pink-300",
  null: "text-white/40",
};

/** Editor for a single schema value (type + constraints + nested structure). */
export function SchemaNode({ schema, onChange }: { schema: JsonSchema; onChange: (s: JsonSchema) => void }) {
  const type = typeOf(schema);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => onChange(schemaForType(e.target.value as SchemaType, schema))}
          className={`rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold outline-none focus:border-indigo-400/50 ${TYPE_COLORS[type]}`}
        >
          {SCHEMA_TYPES.map((t) => <option key={t} value={t} className="text-slate-900">{t}</option>)}
        </select>

        {type === "string" && (
          <select
            value={schema.format ?? ""}
            onChange={(e) => onChange(setKeyword(schema, "format", e.target.value))}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 outline-none focus:border-indigo-400/50"
            title="String format"
          >
            {STRING_FORMATS.map((f) => <option key={f} value={f} className="text-slate-900">{f || "format: none"}</option>)}
          </select>
        )}

        {(type === "number" || type === "integer") && (
          <>
            <Num placeholder="min" value={schema.minimum} onChange={(v) => onChange(setKeyword(schema, "minimum", v))} />
            <Num placeholder="max" value={schema.maximum} onChange={(v) => onChange(setKeyword(schema, "maximum", v))} />
          </>
        )}

        {type === "string" && (
          <label className="flex items-center gap-1 text-[11px] text-white/55" title="Redact from AI prompts / logs">
            <input
              type="checkbox"
              checked={schema["x-sensitive"] === true}
              onChange={(e) => onChange(setKeyword(schema, "x-sensitive", e.target.checked || undefined))}
              className="accent-rose-500"
            />
            sensitive
          </label>
        )}
      </div>

      <input
        defaultValue={schema.description ?? ""}
        key={`desc-${schema.description ?? ""}`}
        onBlur={(e) => onChange(setKeyword(schema, "description", e.target.value))}
        placeholder="Description (helps AI + humans)"
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 outline-none focus:border-indigo-400/50"
      />

      {type === "string" && (
        <input
          defaultValue={(schema.enum as string[] | undefined)?.join(", ") ?? ""}
          key={`enum-${(schema.enum as string[] | undefined)?.join(",") ?? ""}`}
          onBlur={(e) => {
            const vals = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
            onChange(setKeyword(schema, "enum", vals.length ? vals : undefined));
          }}
          placeholder="Allowed values (comma-separated enum)"
          className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-white/80 outline-none focus:border-indigo-400/50"
        />
      )}

      {type === "object" && <ObjectProps schema={schema} onChange={onChange} />}

      {type === "array" && (
        <div className="rounded-md border border-pink-400/20 bg-pink-500/5 p-2">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-pink-300/80">Each item</div>
          <SchemaNode schema={schema.items ?? { type: "string" }} onChange={(items) => onChange({ ...schema, items })} />
        </div>
      )}
    </div>
  );
}

function ObjectProps({ schema, onChange }: { schema: JsonSchema; onChange: (s: JsonSchema) => void }) {
  const props = schema.properties ?? {};
  const entries = Object.entries(props);
  return (
    <div className="space-y-1.5">
      {entries.length === 0 && <p className="text-[11px] text-white/35">No fields yet — add one or infer from JSON.</p>}
      {entries.map(([key, propSchema]) => (
        <PropertyRow
          key={key}
          name={key}
          schema={propSchema}
          required={isRequired(schema, key)}
          onToggleRequired={(req) => onChange(setRequired(schema, key, req))}
          onRename={(to) => onChange(renameProperty(schema, key, to))}
          onChange={(s) => onChange(setProperty(schema, key, s))}
          onRemove={() => onChange(removeProperty(schema, key))}
        />
      ))}
      <button
        onClick={() => onChange(addProperty(schema).schema)}
        className="rounded-md border border-dashed border-white/15 px-2 py-1 text-[11px] text-white/55 transition hover:border-indigo-400/50 hover:text-white"
      >
        + Add field
      </button>
    </div>
  );
}

function PropertyRow({
  name, schema, required, onToggleRequired, onRename, onChange, onRemove,
}: {
  name: string;
  schema: JsonSchema;
  required: boolean;
  onToggleRequired: (req: boolean) => void;
  onRename: (to: string) => void;
  onChange: (s: JsonSchema) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const t = typeOf(schema);
  const expandable = t === "object" || t === "array";
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02]">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          onClick={() => expandable && setOpen((o) => !o)}
          className={`w-3 text-center text-white/40 ${expandable ? "" : "invisible"}`}
        >
          {open ? "▾" : "▸"}
        </button>
        <input
          defaultValue={name}
          key={`name-${name}`}
          onBlur={(e) => e.target.value !== name && onRename(e.target.value.trim())}
          className="w-40 rounded border border-transparent bg-white/5 px-1.5 py-0.5 font-mono text-xs text-white/90 outline-none focus:border-indigo-400/50"
        />
        <span className={`text-[10px] font-semibold uppercase ${TYPE_COLORS[t]}`}>{t}{schema.format ? `·${schema.format}` : ""}</span>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-white/45" title="Required">
          <input type="checkbox" checked={required} onChange={(e) => onToggleRequired(e.target.checked)} className="accent-indigo-500" />
          req
        </label>
        <button onClick={onRemove} title="Remove field" className="text-rose-400/70 hover:text-rose-300">✕</button>
      </div>
      {(open || !expandable) && (
        <div className="border-t border-white/5 px-2.5 py-2 pl-5">
          <SchemaNode schema={schema} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function Num({ value, placeholder, onChange }: { value?: number; placeholder: string; onChange: (v: number | undefined) => void }) {
  return (
    <input
      type="number"
      defaultValue={value ?? ""}
      key={`${placeholder}-${value ?? ""}`}
      placeholder={placeholder}
      onBlur={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className="w-16 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 outline-none focus:border-indigo-400/50"
    />
  );
}
