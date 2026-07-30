#!/usr/bin/env node
/**
 * Apply schema.sql to the local D1 database named in project configuration.
 * Generates wrangler.worker.toml first so a fresh clone works without committed
 * instance IDs.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWranglerConfig } from "./generate-wrangler-config.mjs";
import { resolveProject } from "./lib/project-config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  await generateWranglerConfig({ strict: false, root: ROOT });
  const project = resolveProject({ strict: false });

  const result = spawnSync(
    "npx",
    [
      "--no",
      "wrangler",
      "d1",
      "execute",
      project.d1Name,
      "--config",
      "wrangler.worker.toml",
      "--local",
      "--file=schema.sql"
    ],
    { cwd: ROOT, stdio: "inherit", shell: false }
  );

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
