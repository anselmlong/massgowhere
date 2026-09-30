const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Church pages show the parish text word for word. Notes about how it was read ("poster and footer agree",
// "detail link retained in page evidence") mean nothing to a visitor; the monthly read is told not to write them.
const REVIEWER = /\b(homepage|footer|excerpt|evidence|captured|explicitly|appears to|typo|not general|conflict requires|so verify|verify (eligibility|current|operational))\b/i;

test("no reviewer notes in the text church pages show", () => {
  const dir = path.join(__dirname, "..", "public", "parish");
  const hits = [];
  const walk = (o, where) => {
    if (typeof o === "string") { if (!/url$|^\.(from|readAt)/.test(where) && REVIEWER.test(o)) hits.push(`${where}: ${o.slice(0, 120)}`); }
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, `${where}.${k}`);
  };
  for (const f of fs.readdirSync(dir)) walk(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), f.replace(".json", ""));
  assert.deepEqual(hits, []);
});
