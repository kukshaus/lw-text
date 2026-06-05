const useColor = process.stdout.isTTY && !process.env["NO_COLOR"];

function wrap(code: number, s: string): string {
  return useColor ? `\u001b[${code}m${s}\u001b[0m` : s;
}

export const c = {
  red: (s: string) => wrap(31, s),
  green: (s: string) => wrap(32, s),
  yellow: (s: string) => wrap(33, s),
  blue: (s: string) => wrap(34, s),
  magenta: (s: string) => wrap(35, s),
  cyan: (s: string) => wrap(36, s),
  gray: (s: string) => wrap(90, s),
  bold: (s: string) => wrap(1, s),
};

export const sym = {
  ok: c.green("✓"),
  err: c.red("✗"),
  warn: c.yellow("▲"),
  arrow: c.gray("→"),
};
