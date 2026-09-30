"""MassGoWhere Telegram bot: share your location (or send a postal code), get the Mass you can attend.

No dependencies: long-polls the Telegram Bot API and asks massgowhere.com/api/next for the answer,
so the bot always says exactly what the website says.

Run: python3 bot/bot.py      (reads TELEGRAM_BOT_TOKEN from .env; MASSGOWHERE_API overrides the site URL)
"""
import concurrent.futures as cf
import hashlib
import json
import logging
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SGT = timezone(timedelta(hours=8))
MODES = {"transit": ("Bus & MRT", "by bus & MRT", "transit"), "drive": ("Car", "by car", "driving"), "walk": ("Walk", "on foot", "walking")}
STATE_FILE = os.path.join(ROOT, "bot", "state.json")  # chat id -> preferred mode (no locations are stored)
NUDGE_FILE = os.path.join(ROOT, "bot", "nudges.json")  # chat id -> answers given, for the occasional feedback prompt
FEEDBACK_LOG = os.path.join(ROOT, "bot", "feedback.log")
STATS_FILE = os.path.join(ROOT, "bot", "stats.json")  # daily counts; people as salted hashes, never names or locations

logging.basicConfig(format="%(asctime)s %(levelname)s %(message)s", level=logging.INFO)
logging.getLogger("urllib3").setLevel(logging.WARNING)
log = logging.getLogger("massgowhere-bot")


def load_env():
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for line in open(path):
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.rstrip("\n").split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()
TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
SITE = os.environ.get("MASSGOWHERE_API", "https://massgowhere.com").rstrip("/")  # the website and its API; set this when the domain moves
SITE_NAME = SITE.split("//")[-1]
TG = f"https://api.telegram.org/bot{TOKEN}"


def http_json(url, data=None, timeout=40):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "User-Agent": "MassGoWhere-bot"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def tg(method, **params):
    return http_json(f"{TG}/{method}", params)


# ---------- state ----------

def load_state():
    try:
        return json.load(open(STATE_FILE))
    except (OSError, ValueError):
        return {}


STATE = load_state()


def mode_for(chat_id):
    return STATE.get(str(chat_id), "transit")


STATE_LOCK = __import__("threading").Lock()


def set_mode(chat_id, mode):
    with STATE_LOCK:
        STATE[str(chat_id)] = mode
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(STATE, f)
        os.replace(tmp, STATE_FILE)


# ---------- usage stats (for the owner's /stats) ----------
# Per SGT day: answers given, how people asked (location / typed place / re-run after a mode change),
# travel mode, and the set of people who asked, as salted hashes of their chat id.

ADMIN_IDS = {x.strip() for x in os.environ.get("ADMIN_CHAT_IDS", "495290408").split(",") if x.strip()}
STATS_LOCK = __import__("threading").Lock()


def load_stats():
    try:
        st = json.load(open(STATS_FILE))
    except (OSError, ValueError):
        st = {}
    st.setdefault("salt", os.urandom(8).hex())
    st.setdefault("days", {})
    return st


STATS = load_stats()


def sgt_day(offset=0):
    return (datetime.now(timezone(timedelta(hours=8))) - timedelta(days=offset)).strftime("%Y-%m-%d")


def record(chat_id, via):
    """Count one answer. Never lets a stats problem get in the way of the answer."""
    try:
        who = hashlib.sha256(f"{STATS['salt']}:{chat_id}".encode()).hexdigest()[:12]
        with STATS_LOCK:
            d = STATS["days"].setdefault(sgt_day(), {"answers": 0, "people": [], "via": {}, "mode": {}})
            d["answers"] += 1
            if who not in d["people"]:
                d["people"].append(who)
            d["via"][via] = d["via"].get(via, 0) + 1
            m = mode_for(chat_id)
            d["mode"][m] = d["mode"].get(m, 0) + 1
            tmp = STATS_FILE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(STATS, f)
            os.replace(tmp, STATS_FILE)
    except Exception as e:  # noqa: BLE001
        log.warning("stats not recorded: %s", e)


def stats_text():
    days = STATS["days"]

    def span(n):
        ds = [days[k] for k in (sgt_day(i) for i in range(n)) if k in days]
        people = set().union(*[set(d["people"]) for d in ds]) if ds else set()
        via, mode = {}, {}
        for d in ds:
            for k, v in d["via"].items():
                via[k] = via.get(k, 0) + v
            for k, v in d["mode"].items():
                mode[k] = mode.get(k, 0) + v
        return sum(d["answers"] for d in ds), people, via, mode

    everyone = set().union(*[set(d["people"]) for d in days.values()]) if days else set()
    week_people = span(7)[1]
    before = set().union(*[set(d["people"]) for k, d in days.items() if k < sgt_day(6)]) if days else set()
    lines = ["<b>MassGoWhere bot</b>"]
    for label, n in (("Today", 1), ("Last 7 days", 7), ("Last 30 days", 30)):
        a, p, _, _ = span(n)
        lines.append(f"{label}: {a} searches · {len(p)} {'person' if len(p) == 1 else 'people'}")
    lines.append(f"All time: {sum(d['answers'] for d in days.values())} searches · {len(everyone)} people")
    lines.append(f"New this week: {len(week_people - before)}")
    _, _, via, mode = span(30)
    total = sum(mode.values()) or 1
    if mode:
        lines.append("30-day travel: " + " · ".join(f"{MODES[k][0]} {round(100 * v / total)}%" for k, v in sorted(mode.items(), key=lambda x: -x[1]) if k in MODES))
    if via:
        names = {"location": "shared location", "text": "typed a place", "mode": "switched mode", "way": "on the way"}
        lines.append("30-day asked by: " + " · ".join(f"{names.get(k, k)} {v}" for k, v in sorted(via.items(), key=lambda x: -x[1])))
    lines.append("")
    lines.append("<i>Website visitors are in Vercel → Analytics.</i>")
    return "\n".join(lines)


# ---------- formatting ----------

def clock(iso):
    t = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(SGT)
    return t.strftime("%-I:%M%p").lower()


def day_label(iso):
    d = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(SGT).date()
    today = datetime.now(SGT).date()
    if d == today:
        return "today"
    if d == today + timedelta(days=1):
        return "tomorrow"
    return d.strftime("%A %-d %b")


def mins(m):
    return f"{m} min" if m < 60 else f"{m // 60} h {m % 60} min".replace(" 0 min", "")


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def gmaps(parish, mode, lat, lng):
    dest = urllib.parse.quote(f"{parish['name']}, Singapore {parish.get('postal') or ''}".strip())
    return f"https://www.google.com/maps/dir/?api=1&destination={dest}&travelmode={MODES[mode][2]}&origin={lat},{lng}"


def mode_keyboard(current):
    return [[{"text": ("• " if k == current else "") + v[0], "callback_data": f"mode:{k}"} for k, v in MODES.items()]]


WAY_BUTTON = "Catch a Mass on the way"
LOCATION_KB = {"keyboard": [[{"text": "Share my location", "request_location": True}], [{"text": WAY_BUTTON}]],
               "resize_keyboard": True, "is_persistent": True, "input_field_placeholder": "Or type a postal code or place"}

WELCOME = ("<b>MassGoWhere</b> finds a Mass in Singapore you can attend, and tells you when to leave.\n\n"
           "Tap <b>Share my location</b> below, or send a postal code or place name.\n"
           "Travelling by: <b>{mode}</b> (change it with the buttons).\n\n"
           "Leave-by times get you there 5 minutes early, so you can settle in and prepare for Mass.\n\n"
           f"Going somewhere? Tap <b>{WAY_BUTTON}</b> to fit in a Mass along your route.\n\n"
           "Something not right, or an idea? Send /feedback. Anselm, who built this, reads every message.\n\n"
           f"To plan ahead or browse every church on a map, open <a href=\"{SITE}\">{SITE_NAME}</a>.")


# ---------- answers ----------

LIVE_WAIT_S = 3  # wait this long for live travel times before showing the estimate, so most answers appear once
LIVE_POOL = cf.ThreadPoolExecutor(max_workers=4)


def live_then_estimate(live_url, fast_url, show_live, show_estimate, on_fail):
    """Start the live request; if it lands within LIVE_WAIT_S show only that. Otherwise show the estimate, then
    the live answer as an edit when it comes; if live fails, keep the estimate (show_estimate(res, final=True))."""
    live = LIVE_POOL.submit(http_json, live_url, timeout=20)
    try:
        return show_live(live.result(timeout=LIVE_WAIT_S))
    except cf.TimeoutError:
        pass
    except Exception as e:  # noqa: BLE001 - live failed quickly; fall through to the estimate
        log.warning("live api error: %s", e)
    estimate = None
    try:
        estimate = http_json(fast_url, timeout=8)
        show_estimate(estimate, False)
    except Exception as e:  # noqa: BLE001
        log.warning("fast api error: %s", e)
    try:
        return show_live(live.result(timeout=20))
    except Exception as e:  # noqa: BLE001
        log.warning("api error: %s", e)
        return show_estimate(estimate, True) if estimate else on_fail()

def in_singapore(lat, lng):
    # same rough box as api/next.js; a box cannot fully separate Woodlands from Johor Bahru, the API is the last word
    return 1.15 < lat < 1.475 and 103.59 < lng < 104.1


def placeholder(chat_id, text):
    """A message that appears the moment someone asks; the answer then replaces it in place."""
    try:
        return tg("sendMessage", chat_id=chat_id, text=text)["result"]["message_id"]
    except Exception as e:  # noqa: BLE001 - the answer is still sent as a fresh message
        log.warning("placeholder failed: %s", e)
        return None


def answer(chat_id, lat, lng, place=None, msg_id=None):
    mode = mode_for(chat_id)

    def show(text, kb=None, html=True):
        extra = {"parse_mode": "HTML", "link_preview_options": {"is_disabled": True}} if html else {}
        if kb is not None:
            extra["reply_markup"] = {"inline_keyboard": kb}
        if msg_id:
            try:
                return tg("editMessageText", chat_id=chat_id, message_id=msg_id, text=text, **extra)
            except Exception as e:  # noqa: BLE001 - e.g. "message is not modified"; fall through to a new message
                log.warning("edit failed: %s", e)
        return tg("sendMessage", chat_id=chat_id, text=text, **extra)

    if not in_singapore(lat, lng):
        return show("That location isn't in Singapore. MassGoWhere only covers Singapore's parishes; "
                    "send a Singapore postal code or place name instead.", html=False)
    if not msg_id:
        msg_id = placeholder(chat_id, f"Looking for a Mass near {place}…" if place else "Looking for a Mass near you…")
    build = urllib.parse.urlencode({"lat": f"{lat:.5f}", "lng": f"{lng:.5f}", "mode": mode})

    def paint(res, fast):
        """(text, keyboard) for an /api/next payload. fast -> "about" flagged on estimates."""
        b = res.get("best")
        where = f" from {esc(place)}" if place else ""
        if not b:
            return ("I couldn't find a Mass you can reach in the next two days{where} {mode}. Try another way of travelling.".format(
                        where=where, mode=MODES[mode][1]),
                    mode_keyboard(mode) + [[{"text": "Browse all churches", "url": f"{SITE}/#/churches"}]])
        p = b["parish"]
        about = "about " if b.get("travelSource") == "estimate" else ""
        how = "walk" if b.get("walk") else mode  # bus & MRT mode, but it's quicker on foot
        extra = " · ".join(x for x in [f"{b['language']} Mass" if b.get("language") and b["language"] != "English" else "", b.get("note") or ""] if x)
        lines = [
            f"<b>{clock(b['start'])} {day_label(b['start'])}</b>",
            f"<b>{esc(p['name'])}</b>" + (f"\n{esc(extra)}" if extra else ""),
            "",
            f"Leave by <b>{clock(b['leaveBy'])}</b> · {about}{mins(b['travelMin'])} {MODES[how][1]}{where}",
            "<i>That gets you there 5 minutes early, to settle in before Mass.</i>",
        ]
        alts = [a for a in res.get("alternatives") or [] if a]
        if alts:
            lines += ["", "<i>Also reachable:</i>"] + [
                f"{clock(a['start'])} {day_label(a['start'])} · {esc(a['parish']['name'])} ({mins(a['travelMin'])})" for a in alts]
        near = res.get("nearest")
        if near and near["parish"]["id"] != p["id"]:
            nn = near.get("next")
            when = f", next Mass you can attend {clock(nn['start'])} {day_label(nn['start'])}" if nn else ""
            lines += ["", f"<i>Nearest church:</i> {esc(near['parish']['name'])} ({mins(near['travelMin'])}{when})"]
        if fast:
            lines += ["", "<i>Refining live travel times…</i>"]
        if res.get("specialDay"):
            lines += ["", f"<i>{esc(res['specialDay'])}: Mass times often change today. Please check with the parish.</i>"]
        lines += ["", "Peace be with you!"]
        kb = [[{"text": "Navigate", "url": gmaps(p, how, lat, lng)}],
              [{"text": "Mass times at this church", "url": f"{SITE}/#/church/{p['id']}"}],
              # the same answer on the website, where you can also pick a later leave time
              [{"text": f"Open on {SITE_NAME}", "url": f"{SITE}/#/next?{build}&" + urllib.parse.urlencode({"from": place or "your location"})}]] + mode_keyboard(mode)
        return ("\n".join(lines), kb)

    # placeholder (already on screen) -> the live answer, or the estimate first when live is slow; each an edit
    live_then_estimate(
        f"{SITE}/api/next?{build}", f"{SITE}/api/next?{build}&fast=1",
        lambda res: show(*paint(res, fast=False)),
        lambda res, final: show(*paint(res, fast=not final)),
        lambda: show("Sorry, I couldn't check Mass times just now. Please try again in a minute.", mode_keyboard(mode)))


def search_place(text):
    q = urllib.parse.urlencode({"searchVal": text, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": 1})
    res = http_json(f"https://www.onemap.gov.sg/api/common/elastic/search?{q}", timeout=15).get("results") or []
    if not res:
        return None
    x = res[0]
    name = x["BUILDING"] if x.get("BUILDING") not in (None, "", "NIL") else x["SEARCHVAL"]
    return float(x["LATITUDE"]), float(x["LONGITUDE"]), re.sub(r"\b(Mrt|Lrt|Nus|Ntu|Smu|Cbd|Hdb|[A-Za-z]{1,3}\d+)\b", lambda m: m.group(0).upper(), name.title())


LAST = {}  # chat id -> (lat, lng, place) of the last query, in memory only, to redo it after a mode change
LAST_AT = {}  # chat id -> when LAST was set, so "on the way" can start from where you just were


# ---------- feedback ----------
FEEDBACK_CHAT = os.environ.get("FEEDBACK_CHAT_ID") or sorted(ADMIN_IDS)[0]
AWAITING_FEEDBACK = set()  # chats whose next message is feedback
NUDGE_AT = (3, 15)         # after this many answers, ask once for feedback
NUDGE_LOCK = __import__("threading").Lock()


def send_feedback(msg, text):
    """Pass feedback to Anselm (FEEDBACK_CHAT) with who sent it, so he can reply; keep a copy on disk."""
    frm = msg.get("from") or {}
    who = " ".join(x for x in [frm.get("first_name"), frm.get("last_name")] if x) or "Someone"
    handle_ = f" @{frm['username']}" if frm.get("username") else ""
    tg("sendMessage", chat_id=FEEDBACK_CHAT, parse_mode="HTML",
       text=f"💬 <b>Feedback from {esc(who)}</b>{esc(handle_)} (<a href=\"tg://user?id={frm.get('id', '')}\">open chat</a>)\n\n{esc(text[:3500])}")
    try:
        with open(FEEDBACK_LOG, "a") as f:
            f.write(json.dumps({"at": datetime.now(SGT).isoformat(timespec="seconds"), "from": who + handle_, "text": text}) + "\n")
    except OSError as e:
        log.warning("feedback not logged: %s", e)


def maybe_nudge(chat_id):
    """Now and then (after the 3rd and 15th answer), ask how it's going. Never more than that."""
    try:
        with NUDGE_LOCK:
            try:
                n = json.load(open(NUDGE_FILE))
            except (OSError, ValueError):
                n = {}
            k = str(chat_id)
            n[k] = n.get(k, 0) + 1
            count = n[k]
            tmp = NUDGE_FILE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(n, f)
            os.replace(tmp, NUDGE_FILE)
        if count in NUDGE_AT:
            tg("sendMessage", chat_id=chat_id,
               text="Is MassGoWhere working for you? Anselm would appreciate anything you'd tell him: what helped, what didn't, "
                    "or a Mass time that was wrong. Just send /feedback.")
    except Exception as e:  # noqa: BLE001 - never let this get in the way
        log.warning("nudge failed: %s", e)


# ---------- a Mass on the way ----------
# Tap the button, say where you're going (and optionally by when); the bot finds the Mass that adds least to the trip.
# From is where you last shared or searched (if within 30 minutes), otherwise it asks.
WAY = {}  # chat id -> {"step": "from"|"to"|"by", "from": (lat, lng, label), "to": (lat, lng, label)}
BY_KB = [[{"text": "No rush", "callback_data": "way:by:0"}, {"text": "In 1 hour", "callback_data": "way:by:1"}],
         [{"text": "In 2 hours", "callback_data": "way:by:2"}, {"text": "In 3 hours", "callback_data": "way:by:3"}]]


def parse_clock(text):
    """'7pm', '7:30pm', '19:30' -> the next such time (SGT), as epoch ms; None if it isn't a time."""
    m = re.fullmatch(r"\s*(?:by\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*", text.lower())
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if mi > 59 or h > 23 or (ap and not 1 <= h <= 12):
        return None
    if ap:
        h = h % 12 + (12 if ap == "pm" else 0)
    now = datetime.now(SGT)
    t = now.replace(hour=h, minute=mi, second=0, microsecond=0)
    if t <= now:
        t += timedelta(days=1)
    return int(t.timestamp() * 1000)


def way_start(chat_id):
    fresh = chat_id in LAST and time.time() - LAST_AT.get(chat_id, 0) < 30 * 60
    if fresh:
        WAY[chat_id] = {"step": "to", "from": LAST[chat_id]}
        where = LAST[chat_id][2] or "where you shared"
        return tg("sendMessage", chat_id=chat_id, parse_mode="HTML",
                  text=f"Starting from <b>{esc(where)}</b>. Where are you heading? Send a postal code or place name.",
                  reply_markup={"inline_keyboard": [[{"text": "Start somewhere else", "callback_data": "way:from"}]]})
    WAY[chat_id] = {"step": "from"}
    return tg("sendMessage", chat_id=chat_id,
              text="Where are you now? Tap Share my location, or send a postal code or place name.", reply_markup=LOCATION_KB)


def way_got_place(chat_id, place):
    w = WAY[chat_id]
    if w["step"] == "from":
        w.update(step="to", **{"from": place})
        return tg("sendMessage", chat_id=chat_id, text="Where are you heading? Send a postal code or place name.")
    w.update(step="by", to=place)
    return tg("sendMessage", chat_id=chat_id, text="When do you need to be there? Or type a time, like 7pm.",
              reply_markup={"inline_keyboard": BY_KB})


def way_answer(chat_id, by_ms=None):
    w = WAY.pop(chat_id, None)
    if not w or "to" not in w:
        return way_start(chat_id)
    (flat, flng, flabel), (tlat, tlng, tlabel) = w["from"], w["to"]
    flabel, tlabel = flabel or "where you are", tlabel or "your destination"
    mode = mode_for(chat_id)
    record(chat_id, "way")
    msg_id = placeholder(chat_id, f"Looking for a Mass on your way to {tlabel}…")
    q = {"from": f"{flat:.5f},{flng:.5f}", "to": f"{tlat:.5f},{tlng:.5f}", "mode": mode}
    if by_ms:
        q["by"] = str(by_ms)
    build = urllib.parse.urlencode(q)
    site = f"{SITE}/#/way?" + urllib.parse.urlencode({**q, "fromName": flabel, "toName": tlabel})

    def show(text, kb):
        extra = {"parse_mode": "HTML", "link_preview_options": {"is_disabled": True}, "reply_markup": {"inline_keyboard": kb}}
        if msg_id:
            try:
                return tg("editMessageText", chat_id=chat_id, message_id=msg_id, text=text, **extra)
            except Exception as e:  # noqa: BLE001 - e.g. "message is not modified"
                log.warning("edit failed: %s", e)
                return None
        return tg("sendMessage", chat_id=chat_id, text=text, **extra)

    def paint(res, fast):
        b = res.get("best")
        if not b:
            why = f"that gets you to {esc(tlabel)} in time" if by_ms else f"on your way to {esc(tlabel)}"
            return (f"I couldn't find a Mass {why}. Try a later time, or another way of travelling.",
                    [[{"text": "Try it on the website", "url": site}]])
        p = b["parish"]
        about = "about " if b.get("travelSource") == "estimate" else ""
        adds = "right on your way" if b["detourMin"] <= 3 else f"adds {mins(b['detourMin'])} to your trip"
        to_how = MODES["walk" if b.get("toWalk") else mode][1]
        on_how = MODES["walk" if b.get("onwardWalk") else mode][1]
        lines = [
            f"<b>{clock(b['start'])} {day_label(b['start'])}</b> · {adds}",
            f"<b>{esc(p['name'])}</b>",
            f"Mass until about {clock(b['end'])}",
            "",
            f"Leave by <b>{clock(b['leaveBy'])}</b> · {about}{mins(b['toMin'])} {to_how} from {esc(flabel)}",
            f"Then {about}{mins(b['onwardMin'])} {on_how} to {esc(tlabel)}, arriving about <b>{clock(b['arrive'])}</b>",
        ]
        alts = [a for a in res.get("alternatives") or [] if a]
        if alts:
            lines += ["", "<i>Also on the way:</i>"] + [
                f"{clock(a['start'])} {day_label(a['start'])} · {esc(a['parish']['name'])} "
                f"({'on the way' if a['detourMin'] <= 3 else '+' + mins(a['detourMin'])})" for a in alts]
        if fast:
            lines += ["", "<i>Refining live travel times…</i>"]
        lines += ["", "Peace be with you!"]
        church_dir = f"https://www.google.com/maps/dir/?api=1&origin={flat},{flng}&destination={p['lat']},{p['lng']}&travelmode={MODES['walk' if b.get('toWalk') else mode][2]}"
        on_dir = f"https://www.google.com/maps/dir/?api=1&origin={p['lat']},{p['lng']}&destination={tlat},{tlng}&travelmode={MODES['walk' if b.get('onwardWalk') else mode][2]}"
        return ("\n".join(lines), [[{"text": "Navigate to the church", "url": church_dir}],
                                   [{"text": f"Then on to {tlabel[:40]}", "url": on_dir}],
                                   [{"text": "See it on a map", "url": site}]])

    live_then_estimate(
        f"{SITE}/api/way?{build}", f"{SITE}/api/way?{build}&fast=1",
        lambda res: show(*paint(res, fast=False)),
        lambda res, final: show(*paint(res, fast=not final)),
        lambda: show("Sorry, I couldn't plan that just now. Please try again in a minute.", [[{"text": "Try it on the website", "url": site}]]))
    maybe_nudge(chat_id)


def ack(cq, text=None):
    """Stop the button's spinner. Best effort: Telegram refuses (400 "query is too old") once a tap has
    waited too long, e.g. across a restart, and the tap must still change the answer."""
    try:
        tg("answerCallbackQuery", callback_query_id=cq["id"], **({"text": text} if text else {}))
    except Exception as e:  # noqa: BLE001
        log.warning("answerCallbackQuery failed: %s", e)


def handle(update):
    if "callback_query" in update:
        cq = update["callback_query"]
        data = cq.get("data", "")
        chat_id = (cq.get("message") or {}).get("chat", {}).get("id")
        if not chat_id:
            return ack(cq, "Please send /start again.")
        if data == "way:from":
            ack(cq)
            WAY[chat_id] = {"step": "from"}
            return tg("sendMessage", chat_id=chat_id, text="Where are you starting from? Tap Share my location, or send a postal code or place name.",
                      reply_markup=LOCATION_KB)
        if data.startswith("way:by:"):
            ack(cq)
            if chat_id not in WAY or WAY[chat_id].get("step") != "by":
                return tg("sendMessage", chat_id=chat_id, text=f"Tap {WAY_BUTTON} to start again.", reply_markup=LOCATION_KB)
            hours = int(data.rsplit(":", 1)[1] or 0)
            return way_answer(chat_id, int((time.time() + hours * 3600) * 1000) if hours else None)
        if data == "fb:cancel":
            AWAITING_FEEDBACK.discard(chat_id)
            return ack(cq, "No problem")
        if data.startswith("mode:") and data[5:] in MODES:
            set_mode(chat_id, data[5:])
            ack(cq, f"Travelling by {MODES[data[5:]][0]}")
            if chat_id in LAST:
                record(chat_id, "mode")
                answer(chat_id, *LAST[chat_id])
                maybe_nudge(chat_id)
            else:
                tg("sendMessage", chat_id=chat_id, text=f"Got it: {MODES[data[5:]][0]}. Now share your location or send a postal code.")
        else:
            ack(cq)
        return
    msg = update.get("message") or {}
    chat_id = msg.get("chat", {}).get("id")
    if not chat_id:
        return
    if "location" in msg:
        loc = msg["location"]
        if chat_id in WAY and WAY[chat_id]["step"] in ("from", "to"):
            return way_got_place(chat_id, (loc["latitude"], loc["longitude"], "where you shared" if WAY[chat_id]["step"] == "from" else "the place you shared"))
        LAST[chat_id] = (loc["latitude"], loc["longitude"], None)
        LAST_AT[chat_id] = time.time()
        record(chat_id, "location")
        answer(chat_id, loc["latitude"], loc["longitude"])
        return maybe_nudge(chat_id)
    text = (msg.get("text") or "").strip()
    if not text:
        return
    if text.startswith("/feedback"):
        WAY.pop(chat_id, None)
        said = text[len("/feedback"):].strip()
        if said:
            send_feedback(msg, said)
            return tg("sendMessage", chat_id=chat_id, text="Thank you! Anselm will read it.")
        AWAITING_FEEDBACK.add(chat_id)
        return tg("sendMessage", chat_id=chat_id,
                  text="What's on your mind? Send it as one message and I'll pass it straight to Anselm, who built MassGoWhere. "
                       "He'll see your Telegram name, so he can reply.",
                  reply_markup={"inline_keyboard": [[{"text": "Cancel", "callback_data": "fb:cancel"}]]})
    if chat_id in AWAITING_FEEDBACK and not text.startswith("/") and text != WAY_BUTTON:
        AWAITING_FEEDBACK.discard(chat_id)
        send_feedback(msg, text)
        return tg("sendMessage", chat_id=chat_id, text="Thank you! Anselm will read it.", reply_markup=LOCATION_KB)
    AWAITING_FEEDBACK.discard(chat_id)
    if text == WAY_BUTTON:
        return way_start(chat_id)
    if text.startswith("/start") or text.startswith("/help"):
        WAY.pop(chat_id, None)
        return tg("sendMessage", chat_id=chat_id, parse_mode="HTML", text=WELCOME.format(mode=MODES[mode_for(chat_id)][0]),
                  reply_markup=LOCATION_KB, link_preview_options={"is_disabled": True})
    if text.startswith("/stats"):
        if str(chat_id) not in ADMIN_IDS:  # to everyone else it's an unknown command
            return tg("sendMessage", chat_id=chat_id, text="Share your location, or send a postal code or place name.", reply_markup=LOCATION_KB)
        return tg("sendMessage", chat_id=chat_id, parse_mode="HTML", text=stats_text())
    if text.startswith("/mode"):
        return tg("sendMessage", chat_id=chat_id, text="How are you travelling?", reply_markup={"inline_keyboard": mode_keyboard(mode_for(chat_id))})
    if text.startswith("/"):
        return tg("sendMessage", chat_id=chat_id, text="Share your location, or send a postal code or place name.", reply_markup=LOCATION_KB)
    w = WAY.get(chat_id)
    if w and w["step"] == "by":
        by = parse_clock(text)
        if by is None:
            return tg("sendMessage", chat_id=chat_id, text="Pick one of the buttons, or type a time like 7pm or 19:30.",
                      reply_markup={"inline_keyboard": BY_KB})
        return way_answer(chat_id, by)
    msg_id = placeholder(chat_id, f"Looking up “{text[:60]}”…")
    try:
        hit = search_place(text)
    except Exception:  # noqa: BLE001 - search trouble reads the same as "not found"
        hit = None
    if not hit:
        not_found = f"I couldn't find “{text[:60]}”. Try a postal code, MRT station or street name."
        if msg_id:
            return tg("editMessageText", chat_id=chat_id, message_id=msg_id, text=not_found)
        return tg("sendMessage", chat_id=chat_id, text=not_found)
    if w and w["step"] in ("from", "to"):
        if msg_id:
            tg("editMessageText", chat_id=chat_id, message_id=msg_id, text=f"Found {hit[2]}.")
        return way_got_place(chat_id, hit)
    LAST[chat_id] = hit
    LAST_AT[chat_id] = time.time()
    record(chat_id, "text")
    answer(chat_id, *hit, msg_id=msg_id)
    maybe_nudge(chat_id)


CHAT_LOCKS = {}


def chat_of(u):
    if "callback_query" in u:
        return ((u["callback_query"].get("message") or {}).get("chat") or {}).get("id")
    return ((u.get("message") or {}).get("chat") or {}).get("id")


def safe_handle(u):
    # one chat's updates run in order (tapping Car then Walk must end on Walk); different chats run in parallel
    lock = CHAT_LOCKS.setdefault(chat_of(u), __import__("threading").Lock())
    try:
        with lock:
            handle(u)
    except Exception:  # noqa: BLE001 - one bad update must not stop the bot
        log.exception("failed to handle update %s", u.get("update_id"))


def main():
    try:
        tg("setMyCommands", commands=[{"command": "start", "description": "Find a Mass you can attend"},
                                      {"command": "mode", "description": "Change how you're travelling"},
                                      {"command": "feedback", "description": "Tell Anselm what's working or not"}])
    except Exception as e:  # noqa: BLE001 - not needed to serve users
        log.warning("setMyCommands failed: %s", e)
    pool = cf.ThreadPoolExecutor(max_workers=6)  # one slow answer must not hold up other chats
    offset = None
    log.info("bot started, api=%s", SITE)
    while True:
        try:
            params = {"timeout": 30, "allowed_updates": ["message", "callback_query"]}
            if offset is not None:
                params["offset"] = offset
            for u in http_json(f"{TG}/getUpdates", params, timeout=45).get("result", []):
                offset = u["update_id"] + 1
                pool.submit(safe_handle, u)
        except Exception as e:  # noqa: BLE001 - dropped connections, SSL errors, bad JSON: back off and keep polling
            log.warning("polling error: %s: %s", type(e).__name__, e)
            time.sleep(5)


if __name__ == "__main__":
    main()
