// GET /data.json — the schedule snapshot. Rewritten here so it can be CDN-cached
// and refreshed from GitHub without a new deployment (see lib/live-data.js).
const { loadData } = require("../lib/live-data");

const CACHE = "public, max-age=300, s-maxage=300, stale-while-revalidate=86400";

module.exports = async function handler(req, res) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  }
  try {
    const data = await loadData();
    const body = JSON.stringify(data);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", CACHE);
    if (req.method === "HEAD") return res.end();
    res.end(body);
  } catch (e) {
    console.error(e);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "Schedule data is unavailable just now." }));
  }
};
