const test = require("node:test");
const assert = require("node:assert/strict");

// OneMap's public-transport router never suggests just walking; tripMinutes must also route the walk
test("tripMinutes takes the walk when it beats bus & MRT, and the transit route when it doesn't", async () => {
  process.env.ONEMAP_EMAIL = "x"; process.env.ONEMAP_PASSWORD = "y";
  let pt = 22 * 60, walk = 7 * 60;
  global.fetch = async (url) => {
    if (String(url).includes("getToken")) return { ok: true, status: 200, json: async () => ({ access_token: "t", expiry_timestamp: Date.now() / 1000 + 3 * 86400 }) };
    const type = new URL(url).searchParams.get("routeType");
    return { ok: true, status: 200, json: async () => (type === "pt" ? { plan: { itineraries: [{ duration: pt }] } } : { route_summary: { total_time: walk } }) };
  };
  const { tripMinutes } = require("../lib/onemap.js");
  const from = { lat: 1.3007, lng: 103.8385 };
  assert.deepEqual(await tripMinutes(from, { lat: 1.2984, lng: 103.8531 }, "transit", Date.UTC(2026, 9, 4, 1)), { minutes: 7, walk: true });
  pt = 12 * 60; walk = 30 * 60;
  assert.deepEqual(await tripMinutes(from, { lat: 1.305, lng: 103.86 }, "transit", Date.UTC(2026, 9, 4, 1)), { minutes: 12, walk: false });
  // within walking range, but a 20-minute walk loses to a 21-minute bus ride in bus & MRT mode
  pt = 21 * 60; walk = 20 * 60;
  assert.deepEqual(await tripMinutes(from, { lat: 1.306, lng: 103.851 }, "transit", Date.UTC(2026, 9, 4, 2)), { minutes: 21, walk: false });
  pt = 12 * 60;
  // far away: transit only, no walk routed
  assert.deepEqual(await tripMinutes(from, { lat: 1.35, lng: 103.94 }, "transit", Date.UTC(2026, 9, 4, 1)), { minutes: 12, walk: false });
});
