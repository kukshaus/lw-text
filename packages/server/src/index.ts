import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { buildServer } from "./app.js";

const port = Number(process.env["PORT"] ?? 4000);
const host = process.env["HOST"] ?? "0.0.0.0";

// Serve the built Studio if it exists (single-command production run).
const studioCandidates = [resolve("apps/studio/dist"), resolve("../../apps/studio/dist")];
const studioDir = studioCandidates.find((p) => existsSync(p));

const app = buildServer({ logger: true, studioDir });

app
  .listen({ port, host })
  .then((addr) => {
    app.log.info(`lw-text API listening on ${addr}`);
    if (studioDir) app.log.info(`Studio served from ${studioDir}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
