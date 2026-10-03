// GET /api/search?q=admiralty%20station  ->  {results: [{name, address, postal, lat, lng}]}
// Place search for the Telegram bot (and anything else that can't call OneMap from a browser): OneMap's search, from
// our servers, with our OneMap token. 502 when OneMap can't be reached, so "not found" and "search is down" differ.
const { searchPlaces } = require("../lib/onemap.js");

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", cache ? "public, s-maxage=86400, max-age=3600" : "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const q = (new URL(req.url, "http://x").searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return send(res, 400, { error: "q: a postal code, MRT station, building or street" });
  try {
    send(res, 200, { results: await searchPlaces(q) }, true); // places don't move: cache a day at the edge
  } catch (e) {
    console.error("search failed:", q, e.message);
    send(res, 502, { error: "Place search is unavailable just now." });
  }
};
