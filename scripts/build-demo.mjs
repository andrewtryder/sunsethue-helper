#!/usr/bin/env node
/**
 * Build a static demo artifact under dist/demo for GitHub Pages.
 * No Functions, D1, Secrets Store, or Access.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "dist/demo");
const fixtures = JSON.parse(readFileSync(resolve(ROOT, "demo/fixtures.json"), "utf8"));

/** Root-absolute asset refs that break under /sunsethue-helper/ subpaths. */
const ROOT_ABS_RE = /(?:href|src|url)\s*=\s*["']\/(?!\/)/i;
const MANIFEST_ROOT_ABS_RE = /"(?:src|start_url|scope)"\s*:\s*"\/(?!\/)/;
const SW_ROOT_ABS_RE = /["'`]\/(?!\/)[A-Za-z0-9._~/-]+["'`]/;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(resolve(ROOT, "public"), OUT, { recursive: true });

let html = readFileSync(resolve(OUT, "index.html"), "utf8");
html = html
  .replace("<html lang=\"en\">", "<html lang=\"en\" data-demo=\"1\">")
  .replace(
    "<head>",
    `<head>\n  <script>window.__SUNSETHUE_DEMO__=true;window.__SUNSETHUE_DEMO_FIXTURES__=${JSON.stringify(fixtures)};</script>`
  );
writeFileSync(resolve(OUT, "index.html"), html);
writeFileSync(resolve(OUT, "fixtures.json"), JSON.stringify(fixtures, null, 2));

// GitHub Pages needs this to serve files starting with underscores and avoid Jekyll processing
writeFileSync(resolve(OUT, ".nojekyll"), "");

if (ROOT_ABS_RE.test(html)) {
  throw new Error("Demo build failed: Found root-relative paths in index.html, which breaks on subpaths.");
}

const manifest = readFileSync(resolve(OUT, "manifest.webmanifest"), "utf8");
if (MANIFEST_ROOT_ABS_RE.test(manifest) || /"(?:src|start_url|scope)"\s*:\s*"\/"/m.test(manifest)) {
  throw new Error("Demo build failed: Found root-relative paths in manifest.webmanifest.");
}

const serviceWorker = readFileSync(resolve(OUT, "service-worker.js"), "utf8");
if (SW_ROOT_ABS_RE.test(serviceWorker)) {
  throw new Error("Demo build failed: Found root-relative paths in service-worker.js.");
}

console.log(`Demo artifact written to ${OUT}`);
