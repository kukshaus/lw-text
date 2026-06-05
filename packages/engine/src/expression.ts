/**
 * Safe expression DSL for lw-text.
 *
 * Used by `if`, `repeat`, `{{ }}` interpolations and bindings. It is a small,
 * sandboxed language evaluated against a scope object — NO JavaScript `eval`,
 * no access to globals, prototypes or functions on the host. This keeps
 * AI-authored and user-authored templates safe to run on the server.
 *
 * Supported:
 *   literals        42, 3.14, "txt", 'txt', true, false, null
 *   member access   DATA.a.b, row.name
 *   index access    items[0], obj["key"]
 *   unary           ! -
 *   arithmetic      + - * / %
 *   comparison      == != === !== < <= > >=
 *   logical         && || and short-circuit, ?? nullish
 *   ternary         cond ? a : b
 *   grouping        ( )
 *   builtins        length(x), upper(x), lower(x), default(x, y),
 *                   round(x, n), abs(x), now()
 */

export class ExpressionError extends Error {
  constructor(
    message: string,
    public readonly pos: number,
    public readonly source: string,
  ) {
    super(message);
    this.name = "ExpressionError";
  }
}

type TokKind =
  | "num"
  | "str"
  | "ident"
  | "punct"
  | "eof";

interface Token {
  kind: TokKind;
  value: string;
  pos: number;
}

const PUNCT = [
  "===", "!==", "==", "!=", "<=", ">=", "&&", "||", "??",
  "(", ")", "[", "]", ".", ",", "?", ":", "<", ">", "+", "-", "*", "/", "%", "!",
];

function lex(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    // number
    if (c >= "0" && c <= "9") {
      let j = i + 1;
      while (j < n && ((src[j]! >= "0" && src[j]! <= "9") || src[j] === ".")) j++;
      tokens.push({ kind: "num", value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    // string
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let out = "";
      while (j < n && src[j] !== quote) {
        if (src[j] === "\\" && j + 1 < n) {
          const next = src[j + 1]!;
          out += next === "n" ? "\n" : next === "t" ? "\t" : next;
          j += 2;
        } else {
          out += src[j];
          j++;
        }
      }
      if (j >= n) throw new ExpressionError("Unterminated string", i, src);
      tokens.push({ kind: "str", value: out, pos: i });
      i = j + 1;
      continue;
    }
    // identifier / keyword
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j]!)) j++;
      tokens.push({ kind: "ident", value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    // punctuation (longest match)
    const matched = PUNCT.find((p) => src.startsWith(p, i));
    if (matched) {
      tokens.push({ kind: "punct", value: matched, pos: i });
      i += matched.length;
      continue;
    }
    throw new ExpressionError(`Unexpected character '${c}'`, i, src);
  }
  tokens.push({ kind: "eof", value: "", pos: n });
  return tokens;
}

/* ----------------------------- AST ----------------------------- */

export type Expr =
  | { t: "lit"; v: unknown }
  | { t: "ident"; name: string }
  | { t: "member"; obj: Expr; prop: string }
  | { t: "index"; obj: Expr; index: Expr }
  | { t: "unary"; op: string; arg: Expr }
  | { t: "bin"; op: string; left: Expr; right: Expr }
  | { t: "logical"; op: string; left: Expr; right: Expr }
  | { t: "cond"; test: Expr; cons: Expr; alt: Expr }
  | { t: "call"; callee: string; args: Expr[] };

/* Pratt parser with binding powers. */
const BP: Record<string, number> = {
  "??": 1,
  "||": 2,
  "&&": 3,
  "==": 4, "!=": 4, "===": 4, "!==": 4,
  "<": 5, "<=": 5, ">": 5, ">=": 5,
  "+": 6, "-": 6,
  "*": 7, "/": 7, "%": 7,
};

class Parser {
  private pos = 0;
  constructor(
    private readonly toks: Token[],
    private readonly src: string,
  ) {}

  private peek(): Token {
    return this.toks[this.pos]!;
  }
  private next(): Token {
    return this.toks[this.pos++]!;
  }
  private expect(value: string): Token {
    const t = this.peek();
    if (t.value !== value) {
      throw new ExpressionError(`Expected '${value}' but got '${t.value || "<eof>"}'`, t.pos, this.src);
    }
    return this.next();
  }

  parse(): Expr {
    const e = this.parseExpr(0);
    if (this.peek().kind !== "eof") {
      throw new ExpressionError(`Unexpected token '${this.peek().value}'`, this.peek().pos, this.src);
    }
    return e;
  }

  private parseExpr(minBp: number): Expr {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.kind === "punct" && t.value === "?") {
        if (minBp > 0) break;
        this.next();
        const cons = this.parseExpr(0);
        this.expect(":");
        const alt = this.parseExpr(0);
        left = { t: "cond", test: left, cons, alt };
        continue;
      }
      const bp = t.kind === "punct" ? BP[t.value] : undefined;
      if (bp === undefined || bp <= minBp) break;
      this.next();
      const right = this.parseExpr(bp);
      if (t.value === "&&" || t.value === "||" || t.value === "??") {
        left = { t: "logical", op: t.value, left, right };
      } else {
        left = { t: "bin", op: t.value, left, right };
      }
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.kind === "punct" && (t.value === "!" || t.value === "-")) {
      this.next();
      return { t: "unary", op: t.value, arg: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.kind === "punct" && t.value === ".") {
        this.next();
        const prop = this.next();
        if (prop.kind !== "ident") {
          throw new ExpressionError("Expected property name after '.'", prop.pos, this.src);
        }
        e = { t: "member", obj: e, prop: prop.value };
      } else if (t.kind === "punct" && t.value === "[") {
        this.next();
        const index = this.parseExpr(0);
        this.expect("]");
        e = { t: "index", obj: e, index };
      } else {
        break;
      }
    }
    return e;
  }

  private parsePrimary(): Expr {
    const t = this.next();
    if (t.kind === "num") return { t: "lit", v: Number(t.value) };
    if (t.kind === "str") return { t: "lit", v: t.value };
    if (t.kind === "ident") {
      if (t.value === "true") return { t: "lit", v: true };
      if (t.value === "false") return { t: "lit", v: false };
      if (t.value === "null") return { t: "lit", v: null };
      // function call?
      if (this.peek().kind === "punct" && this.peek().value === "(") {
        this.next();
        const args: Expr[] = [];
        if (!(this.peek().kind === "punct" && this.peek().value === ")")) {
          args.push(this.parseExpr(0));
          while (this.peek().kind === "punct" && this.peek().value === ",") {
            this.next();
            args.push(this.parseExpr(0));
          }
        }
        this.expect(")");
        return { t: "call", callee: t.value, args };
      }
      return { t: "ident", name: t.value };
    }
    if (t.kind === "punct" && t.value === "(") {
      const e = this.parseExpr(0);
      this.expect(")");
      return e;
    }
    throw new ExpressionError(`Unexpected token '${t.value || "<eof>"}'`, t.pos, this.src);
  }
}

const parseCache = new Map<string, Expr>();

export function parseExpression(src: string): Expr {
  const cached = parseCache.get(src);
  if (cached) return cached;
  const ast = new Parser(lex(src), src).parse();
  parseCache.set(src, ast);
  return ast;
}

/* --------------------------- evaluation --------------------------- */

export type Scope = Record<string, unknown>;

const BUILTINS: Record<string, (...args: unknown[]) => unknown> = {
  length: (x) => (Array.isArray(x) || typeof x === "string" ? (x as { length: number }).length : 0),
  upper: (x) => String(x ?? "").toUpperCase(),
  lower: (x) => String(x ?? "").toLowerCase(),
  default: (x, y) => (x === null || x === undefined || x === "" ? y : x),
  round: (x, n) => {
    const f = Math.pow(10, Number(n ?? 0));
    return Math.round(Number(x) * f) / f;
  },
  abs: (x) => Math.abs(Number(x)),
  now: () => new Date().toISOString(),
};

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

export function evaluate(ast: Expr, scope: Scope): unknown {
  switch (ast.t) {
    case "lit":
      return ast.v;
    case "ident": {
      if (ast.name in scope) return scope[ast.name];
      return undefined;
    }
    case "member": {
      const obj = evaluate(ast.obj, scope);
      if (obj === null || obj === undefined) return undefined;
      // guard against prototype pollution / host access
      if (ast.prop === "__proto__" || ast.prop === "constructor" || ast.prop === "prototype") {
        return undefined;
      }
      if (ast.prop === "length" && (Array.isArray(obj) || typeof obj === "string")) {
        return (obj as { length: number }).length;
      }
      return (obj as Record<string, unknown>)[ast.prop];
    }
    case "index": {
      const obj = evaluate(ast.obj, scope);
      const idx = evaluate(ast.index, scope);
      if (obj === null || obj === undefined) return undefined;
      return (obj as Record<string, unknown>)[idx as string];
    }
    case "unary": {
      const v = evaluate(ast.arg, scope);
      return ast.op === "!" ? !truthy(v) : -Number(v);
    }
    case "logical": {
      const l = evaluate(ast.left, scope);
      if (ast.op === "&&") return truthy(l) ? evaluate(ast.right, scope) : l;
      if (ast.op === "||") return truthy(l) ? l : evaluate(ast.right, scope);
      // ??
      return l === null || l === undefined ? evaluate(ast.right, scope) : l;
    }
    case "cond":
      return truthy(evaluate(ast.test, scope)) ? evaluate(ast.cons, scope) : evaluate(ast.alt, scope);
    case "bin": {
      const l = evaluate(ast.left, scope) as never;
      const r = evaluate(ast.right, scope) as never;
      switch (ast.op) {
        case "+":
          return typeof l === "string" || typeof r === "string"
            ? String(l ?? "") + String(r ?? "")
            : Number(l) + Number(r);
        case "-": return Number(l) - Number(r);
        case "*": return Number(l) * Number(r);
        case "/": return Number(l) / Number(r);
        case "%": return Number(l) % Number(r);
        case "==": return l == r; // eslint-disable-line eqeqeq
        case "!=": return l != r; // eslint-disable-line eqeqeq
        case "===": return l === r;
        case "!==": return l !== r;
        case "<": return l < r;
        case "<=": return l <= r;
        case ">": return l > r;
        case ">=": return l >= r;
        default:
          throw new Error(`Unknown operator ${ast.op}`);
      }
    }
    case "call": {
      const fn = BUILTINS[ast.callee];
      if (!fn) throw new Error(`Unknown function '${ast.callee}'`);
      return fn(...ast.args.map((a) => evaluate(a, scope)));
    }
  }
}

/** Convenience: parse + evaluate. */
export function evalExpr(src: string, scope: Scope): unknown {
  return evaluate(parseExpression(src), scope);
}

/** Collect referenced root-qualified binding paths, e.g. "DATA.a.b". */
export function collectPaths(ast: Expr, roots: Set<string>, out: Set<string>): void {
  switch (ast.t) {
    case "member": {
      const path = memberPath(ast);
      if (path && roots.has(path.split(".")[0]!)) out.add(path);
      else collectPaths(ast.obj, roots, out);
      break;
    }
    case "ident":
      break;
    case "index":
      collectPaths(ast.obj, roots, out);
      collectPaths(ast.index, roots, out);
      break;
    case "unary":
      collectPaths(ast.arg, roots, out);
      break;
    case "bin":
    case "logical":
      collectPaths(ast.left, roots, out);
      collectPaths(ast.right, roots, out);
      break;
    case "cond":
      collectPaths(ast.test, roots, out);
      collectPaths(ast.cons, roots, out);
      collectPaths(ast.alt, roots, out);
      break;
    case "call":
      ast.args.forEach((a) => collectPaths(a, roots, out));
      break;
    case "lit":
      break;
  }
}

function memberPath(ast: Expr): string | null {
  if (ast.t === "ident") return ast.name;
  if (ast.t === "member") {
    const base = memberPath(ast.obj);
    return base ? `${base}.${ast.prop}` : null;
  }
  return null;
}
