// Schedule JSON the data job commits to main (public/data.json, public/parish/<id>.json).
// Production reads the latest commit from GitHub, so a data-only push does not need a
// new Vercel deployment. Local dev, tests, and preview deployments read the copy in
// this checkout. Set DATA_BASE_URL to serve those same repo-relative paths from
// somewhere else (no trailing slash), for example a directory the VPS already has.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DEFAULT_BASE = "https://raw.githubusercontent.com/anselmlong/massgowhere/main";
const FRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 30 * 1000;
const mem = new Map();

function remote() {
  // Vercel redeploys on every data push, so the bundled copy is the current copy: fetching GitHub at request time
  // only added a failure mode where a blocked fetch kept serving a stale snapshot. DATA_BASE_URL opts back in.
  return !!process.env.DATA_BASE_URL;
}

function readLocal(rel) {
  for (const p of [path.join(ROOT, rel), path.join(process.cwd(), rel)]) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch { /* the bundled copy below */ }
  }
  // A static require is traced into the function bundle even when the file
  // isn't on the real filesystem (Vercel output omits it so the rewrite can run).
  if (rel === "public/data.json") return require("../public/data.json");
  const err = new Error(`missing ${rel}`);
  err.code = "ENOENT";
  throw err;
}

async function loadJson(rel) {
  if (!remote()) return readLocal(rel);
  const hit = mem.get(rel);
  const now = Date.now();
  if (hit && now - hit.at < hit.ttl) return hit.data;
  const url = `${(process.env.DATA_BASE_URL || DEFAULT_BASE).replace(/\/$/, "")}/${rel}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (r.status === 404) {
      const err = new Error(`missing ${rel}`);
      err.code = "ENOENT";
      throw err;
    }
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    const data = await r.json();
    mem.set(rel, { at: now, data, ttl: FRESH_MS });
    return data;
  } catch (e) {
    if (hit) {
      mem.set(rel, { at: now, data: hit.data, ttl: RETRY_MS });
      return hit.data;
    }
    if (e.code === "ENOENT") throw e;
    try {
      const data = readLocal(rel);
      mem.set(rel, { at: now, data, ttl: RETRY_MS });
      return data;
    } catch {
      throw e;
    }
  }
}

function loadData() {
  return loadJson("public/data.json");
}

module.exports = { loadJson, loadData };
