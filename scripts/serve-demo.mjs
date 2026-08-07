#!/usr/bin/env node
/**
 * Serves the dist/demo artifact under the /sunsethue-helper/ subpath
 * to verify GitHub Pages compatibility locally.
 */
import { createServer } from "node:http";
import { resolve, dirname, extname, join, normalize } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "dist/demo");
const SUBPATH = "/sunsethue-helper/";
const PORT = Number(process.env.DEMO_PORT || 3001);

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function resolveSafePath(relativePath) {
  const decoded = decodeURIComponent(relativePath);
  if (decoded.includes("\0") || decoded.split("/").includes("..")) {
    return null;
  }
  const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized.startsWith("..")) {
    return null;
  }
  const filePath = join(OUT, normalized === "." || normalized === "" ? "index.html" : normalized);
  if (!filePath.startsWith(OUT)) {
    return null;
  }
  return filePath;
}

const server = createServer((req, res) => {
  console.log(`[Demo] ${req.method} ${req.url}`);

  if (!req.url.startsWith(SUBPATH)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end(`Not found: must use ${SUBPATH}`);
  }

  const relativePath = req.url.slice(SUBPATH.length).split("?")[0];
  const reqPath = relativePath === "" ? "index.html" : relativePath;
  const filePath = resolveSafePath(reqPath);

  if (!filePath) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    return res.end("Bad request");
  }

  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) throw new Error("Not a file");

    const ext = extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": mimeType });
    res.end(readFileSync(filePath));
  } catch {
    // SPA fallback for unknown routes under the subpath
    try {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(readFileSync(join(OUT, "index.html")));
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  }
});

server.listen(PORT, () => {
  console.log(`Demo subpath server running at http://localhost:${PORT}${SUBPATH}`);
});
