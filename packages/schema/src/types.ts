export interface JSONSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  title?: string;
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  format?: string;
  default?: unknown;
  additionalProperties?: boolean | JSONSchema;
  /** lw-text extension: redact in AI prompts / logs. */
  "x-sensitive"?: boolean;
  [key: string]: unknown;
}

export type Severity = "error" | "warning";

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  /** Binding/data path the diagnostic refers to. */
  path?: string;
  /** Source location in the template, when known. */
  loc?: { line: number; col: number };
  /** Short remediation hint for humans and AI agents. */
  hint?: string;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}
