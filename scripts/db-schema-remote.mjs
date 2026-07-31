#!/usr/bin/env node
/**
 * Apply schema.sql to the production D1 database named in project configuration.
 *
 * All statements in schema.sql use IF NOT EXISTS, so this script is safe to
 * re-run. It never drops tables, mutates rows, or reshapes existing columns.
 *
 * Requires an environment where `wrangler` can authenticate against Cloudflare
 * (usually `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`) and a rendered
 * `wrangler.worker.toml`.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWranglerConfig } from "./generate-wrangler-config.mjs";
import { resolveProject } from "./lib/project-config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  await generateWranglerConfig({ strict: true, root: ROOT });
  const project = resolveProject({ strict: true });

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
      "--remote",
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
