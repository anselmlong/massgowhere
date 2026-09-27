// Local dev server: serves public/ and routes /api/* to the Vercel-style handlers in api/.
// Usage: node scripts/dev.js [port]   (reads .env literally; node --env-file mangles values containing '#')
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trimStart().startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim();
  }
}
const PORT = Number(process.argv[2]) || 8787;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    const file = path.join(ROOT, "api", path.basename(url.pathname) + ".js");
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end("not found"); }
    try { return await require(file)(req, res); } catch (e) { res.statusCode = 500; return res.end(String(e)); }
  }
  const file = path.join(ROOT, "public", url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
  if (!file.startsWith(path.join(ROOT, "public")) || !fs.existsSync(file)) { res.statusCode = 404; return res.end("not found"); }
  res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
