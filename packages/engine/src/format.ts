import type { Format } from "./ir.js";

export interface FormatOptions {
  locale?: string;
  currency?: string;
}

/**
 * Format a value for output. Locale-aware via Intl. Designed to be
 * deterministic for a given (value, format, locale) so output caching by
 * content hash is safe.
 */
export function formatValue(value: unknown, format: Format | undefined, opts: FormatOptions = {}): string {
  const locale = opts.locale || "en-US";
  if (value === null || value === undefined) return "";

  switch (format) {
    case undefined:
    case "plain":
    case "html":
      return String(value);

    case "number":
      return new Intl.NumberFormat(locale).format(Number(value));

    case "percent":
      return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(Number(value));

    case "currency":
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: opts.currency || "EUR",
      }).format(Number(value));

    case "date": {
      const d = toDate(value);
      return d ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(d) : String(value);
    }

    case "datetime": {
      const d = toDate(value);
      return d
        ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(d)
        : String(value);
    }

    case "phone":
      return String(value);

    case "iban":
      return String(value)
        .replace(/\s+/g, "")
        .replace(/(.{4})/g, "$1 ")
        .trim();

    default:
      return String(value);
  }
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]!);
}
