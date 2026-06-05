#!/usr/bin/env node
/**
 * One-command dev: starts the API (:4000) and the Studio (:5173) together,
 * with labeled, colorized output and clean shutdown on Ctrl-C.
 * Zero dependencies — just Node.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);

const procs = [
  { name: "server", color: 36, args: ["run", "dev:server"], ready: /listening on/i },
  { name: "studio", color: 35, args: ["run", "dev:studio"], ready: /localhost:5173/i },
];

const width = Math.max(...procs.map((p) => p.name.length));
const children = [];
let shuttingDown = false;

function log(name, color, line) {
  const tag = paint(color, name.padEnd(width));
  process.stdout.write(`${paint(90, "│")} ${tag} ${paint(90, "│")} ${line}\n`);
}

function start(proc) {
  const child = spawn("npm", proc.args, {
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  children.push(child);

  for (const stream of [child.stdout, child.stderr]) {
    const rl = createInterface({ input: stream });
    rl.on("line", (line) => {
      log(proc.name, proc.color, line);
      if (proc.ready.test(line)) log(proc.name, proc.color, paint(32, "✓ ready"));
    });
  }

  child.on("exit", (code) => {
    if (!shuttingDown) {
      log(proc.name, proc.color, paint(31, `exited with code ${code}`));
      shutdown(code ?? 1);
    }
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(paint(1, "\n  lw-text dev") + paint(90, "  —  API http://localhost:4000   Studio http://localhost:5173\n"));
procs.forEach(start);
