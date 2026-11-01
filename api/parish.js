// GET /parish/:id.json — church-page details. Same caching story as /data.json.
const { loadJson } = require("../lib/live-data");

const CACHE = "public, max-age=300, s-maxage=300, stale-while-revalidate=86400";

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(body == null ? "" : JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const id = new URL(req.url, "http://x").searchParams.get("id") || "";
  if (!/^[1-9]\d{0,2}$/.test(id)) return send(res, 400, { error: "Unknown parish" }, "no-store");
  try {
    send(res, 200, await loadJson(`public/parish/${id}.json`), CACHE);
  } catch (e) {
    if (e.code === "ENOENT") return send(res, 404, null, "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
    console.error(e);
    send(res, 502, { error: "Parish details are unavailable just now." }, "no-store");
  }
};
