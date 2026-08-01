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
console.log(`Demo artifact written to ${OUT}`);
