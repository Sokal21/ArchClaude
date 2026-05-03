/**
 * Simple static file server for the TV display.
 * Serves public/ on port 3200.
 *
 * Usage: node server.js [--port 3200]
 */

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");
const portIdx = process.argv.indexOf("--port");
const port = portIdx !== -1 && process.argv[portIdx + 1] ? parseInt(process.argv[portIdx + 1], 10) : 3200;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer((req, res) => {
  let filePath = join(PUBLIC_DIR, req.url === "/" ? "index.html" : req.url);
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  res.end(readFileSync(filePath));
});

server.listen(port, () => {
  console.log(`TV Display: http://localhost:${port}`);
});
