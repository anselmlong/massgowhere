// POST /api/feedback  {message, contact?, page?}  ->  a Telegram message to the owner (same bot as @massgowherebot)
// Needs TELEGRAM_BOT_TOKEN in the Vercel project; FEEDBACK_CHAT_ID overrides where it goes (default: the owner's chat).
const MAX = 2000;
const recent = new Map(); // ip -> [timestamps], best effort per instance: at most 5 messages per 10 minutes

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body; // Vercel parses JSON for us
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 20000) break; }
  return JSON.parse(raw || "{}");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { error: "Send JSON" }); }
  if (body.website) return send(res, 200, { ok: true }); // honeypot: a field people never see, bots fill in
  const message = String(body.message || "").trim().slice(0, MAX);
  const contact = String(body.contact || "").trim().slice(0, 200);
  if (message.length < 2) return send(res, 400, { error: "Please write a little more." });

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  const now = Date.now(), times = (recent.get(ip) || []).filter((t) => now - t < 10 * 60000);
  if (times.length >= 5) return send(res, 429, { error: "Thanks! That's plenty for now; please try again in a few minutes." });
  recent.set(ip, [...times, now]);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return send(res, 503, { error: "Feedback isn't set up yet." });
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = `💬 <b>Website feedback</b>\n\n${esc(message)}${contact ? `\n\n<i>Contact:</i> ${esc(contact)}` : ""}` +
    `\n\n<i>${esc(String(body.page || "").slice(0, 100)) || "/"} · ${esc(String(req.headers["user-agent"] || "").slice(0, 80))}</i>`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.FEEDBACK_CHAT_ID || "495290408", text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`telegram ${r.status}`);
  } catch (e) {
    console.error(e);
    return send(res, 502, { error: "Couldn't send just now." });
  }
  send(res, 200, { ok: true });
};
