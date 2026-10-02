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
import threading
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
    try:
        return http_json(f"{TG}/{method}", params)
    except urllib.error.HTTPError as e:  # say what Telegram said ("message is not modified", "query is too old")
        try:
            desc = json.load(e).get("description", "")
        except Exception:  # noqa: BLE001
            desc = ""
        raise RuntimeError(f"telegram {method} {e.code}: {desc}") from None


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


def sunset(iso):
    """A Saturday Mass from 4pm: a Sunset Mass, which counts for Sunday (same rule as public/schedule.js)."""
    t = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(SGT)
    return t.weekday() == 5 and t.hour >= 16


def sunset_note(iso):
    return " (Sunset Mass)" if sunset(iso) else ""


def mins(m):
    return f"{m} min" if m < 60 else f"{m // 60} h {m % 60} min".replace(" 0 min", "")


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def gmaps(parish, mode, lat, lng):
    dest = urllib.parse.quote(f"{parish['name']}, Singapore {parish.get('postal') or ''}".strip())
    return f"https://www.google.com/maps/dir/?api=1&destination={dest}&travelmode={MODES[mode][2]}&origin={lat},{lng}"


def at_code(lat, lng):
    return f"{lat:.5f},{lng:.5f}"


def mode_keyboard(current, at=None):
    """at: (lat, lng) of the answer the buttons sit under; a tap redoes that answer by the new mode"""
    suffix = f":{at_code(*at)}" if at else ""
    return [[{"text": ("• " if k == current else "") + v[0], "callback_data": f"mode:{k}{suffix}"} for k, v in MODES.items()]]


WAY_BUTTON = "Catch a Mass on the way"
LOCATION_KB = {"keyboard": [[{"text": "Share my location", "request_location": True}], [{"text": WAY_BUTTON}]],
               "resize_keyboard": True, "is_persistent": True, "input_field_placeholder": "Or type a postal code or place"}

WELCOME = ("<b>MassGoWhere</b> finds a Mass in Singapore you can attend, and tells you when to leave.\n\n"
           "Tap <b>Share my location</b> below, or send a postal code or place name.\n"
           "Travelling by: <b>{mode}</b> (change it with the buttons).\n\n"
           "Leave-by times get you there 5 minutes early, so you can settle in and prepare for Mass.\n\n"
           "Need a Mass for Sunday? Tap <b>Sunday or Sunset Mass</b> under any answer.\n\n"
           f"Going somewhere? Tap <b>{WAY_BUTTON}</b> to fit in a Mass along your route.\n\n"
           "Something not right, or an idea? Send /feedback. Anselm, who built this, reads every message.\n\n"
           f"To plan ahead or browse every church on a map, open <a href=\"{SITE}\">{SITE_NAME}</a>.")


# ---------- answers ----------

LIVE_WAIT_S = 3  # wait this long for live travel times before showing the estimate, so most answers appear once
LIVE_POOL = cf.ThreadPoolExecutor(max_workers=16)  # two requests per answer; room for several chats at once
RECOMPUTE_POOL = cf.ThreadPoolExecutor(max_workers=12)  # filter taps re-run answer() here, never on the shared handler pool

# Newest request wins. Each update that asks for an answer (a location, a place, a mode or Sunday tap, an "on the
# way" time) bumps its chat's number; work started for an older number stops waiting and never edits the chat, so a
# quick second tap is answered at once instead of queueing behind the first answer.
GEN = {}
_here = threading.local()


class Superseded(Exception):
    pass


def superseded():
    chat = getattr(_here, "chat", None)
    return chat is not None and GEN.get(chat, 0) != getattr(_here, "gen", 0)


def wait_for(fut, secs):
    """fut.result(), checking every quarter second whether a newer request has replaced this one"""
    end = time.time() + secs
    while True:
        if superseded():
            raise Superseded()
        try:
            return fut.result(timeout=max(0.01, min(0.25, end - time.time())))
        except cf.TimeoutError:
            if fut.done() or time.time() >= end:
                raise


def live_then_estimate(live_url, fast_url, show_live, show_estimate, on_fail):
    """Ask for the live answer and the estimate together. If live lands within LIVE_WAIT_S, show only that;
    otherwise show the estimate (usually ready by then), then the live answer as an edit when it comes. If live
    fails, keep the estimate (show_estimate(res, final=True))."""
    live = LIVE_POOL.submit(http_json, live_url, timeout=20)
    fast = LIVE_POOL.submit(http_json, fast_url, timeout=8)
    try:
        try:
            res = wait_for(live, LIVE_WAIT_S)
        except cf.TimeoutError:
            res = None
        except Superseded:
            raise
        except Exception as e:  # noqa: BLE001 - live failed quickly; fall through to the estimate
            log.warning("live api error: %s", e)
            res = None
        if res is not None:
            return show_live(res)  # outside the waits: a Telegram error here is not "live was slow"
        estimate = None
        try:
            estimate = wait_for(fast, 8)
        except Superseded:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("fast api error: %s", e)
        if estimate is not None:
            show_estimate(estimate, False)
        try:
            res = wait_for(live, 20)
        except Superseded:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("api error: %s", e)
            return show_estimate(estimate, True) if estimate else on_fail()
        return show_live(res)
    except Superseded:
        return None

def in_singapore(lat, lng):
    # same rough box as api/next.js; a box cannot fully separate Woodlands from Johor Bahru, the API is the last word
    return 1.15 < lat < 1.475 and 103.59 < lng < 104.1


def drop_placeholder(chat_id, msg_id):
    """a newer request took over before this one showed anything: don't leave "Looking for…" behind"""
    if msg_id:
        try:
            tg("deleteMessage", chat_id=chat_id, message_id=msg_id)
        except Exception as e:  # noqa: BLE001 - e.g. it already shows an answer, which can stay
            log.warning("delete failed: %s", e)


def placeholder(chat_id, text):
    """A message that appears the moment someone asks; the answer then replaces it in place."""
    try:
        return tg("sendMessage", chat_id=chat_id, text=text)["result"]["message_id"]
    except Exception as e:  # noqa: BLE001 - the answer is still sent as a fresh message
        log.warning("placeholder failed: %s", e)
        return None


def answer(chat_id, lat, lng, place=None, msg_id=None, sunday=False, update_tapped=None):
    """sunday: only Masses for the Sunday obligation (Sunday, or a Saturday Sunset Mass from 4pm).
    update_tapped: the message id of the answer whose button was tapped; it is replaced in place, not repeated."""
    mode = mode_for(chat_id)
    LAST_SUNDAY[chat_id] = sunday  # changing the travel mode re-asks the same question

    def show(text, kb=None, html=True):
        extra = {"parse_mode": "HTML", "link_preview_options": {"is_disabled": True}} if html else {}
        if kb is not None:
            extra["reply_markup"] = {"inline_keyboard": kb}
        if superseded():
            return None  # a newer request from this chat has taken over
        if msg_id:
            try:
                return tg("editMessageText", chat_id=chat_id, message_id=msg_id, text=text, **extra)
            except Exception as e:  # noqa: BLE001 - fall through to a new message, unless nothing changed
                if "not modified" in str(e):
                    return None
                log.warning("edit failed: %s", e)
        return tg("sendMessage", chat_id=chat_id, text=text, **extra)

    what = "a Sunday or Sunset Mass" if sunday else "a Mass"
    if update_tapped and not msg_id:
        msg_id = update_tapped
        show(f"Looking for {what} {MODES[mode][1]}…", html=False)
    if not in_singapore(lat, lng):
        return show("That location isn't in Singapore. MassGoWhere only covers Singapore's parishes; "
                    "send a Singapore postal code or place name instead.", html=False)
    own = None  # the "Looking for…" message this answer made, removed if a newer request takes over
    if not msg_id:
        msg_id = own = placeholder(chat_id, f"Looking for {what} near {place}…" if place else f"Looking for {what} near you…")
    build = urllib.parse.urlencode({"lat": f"{lat:.5f}", "lng": f"{lng:.5f}", "mode": mode, **({"sunday": "1"} if sunday else {})})
    # under every answer: switch between the next Mass and one that counts for Sunday
    here = at_code(lat, lng)
    switch = [[{"text": "Any Mass instead", "callback_data": f"sun:0:{here}"} if sunday else
               {"text": "Sunday or Sunset Mass", "callback_data": f"sun:1:{here}"}]]

    def paint(res, fast):
        """(text, keyboard) for an /api/next payload. fast -> "about" flagged on estimates."""
        b = res.get("best")
        where = f" from {esc(place)}" if place else ""
        if not b:
            return ("I couldn't find {what} you can reach {when}{where} {mode}. Try another way of travelling.".format(
                        what="a Sunday or Sunset Mass" if sunday else "a Mass", when="this week" if sunday else "in the next two days",
                        where=where, mode=MODES[mode][1]),
                    switch + mode_keyboard(mode, (lat, lng)) + [[{"text": "Browse all churches", "url": f"{SITE}/#/churches"}]])
        p = b["parish"]
        about = "about " if b.get("travelSource") == "estimate" else ""
        how = "walk" if b.get("walk") else mode  # bus & MRT mode, but it's quicker on foot
        extra = " · ".join(x for x in [f"{b['language']} Mass" if b.get("language") and b["language"] != "English" else "", b.get("note") or ""] if x)
        lines = [
            f"<b>{clock(b['start'])} {day_label(b['start'])}</b>" + ("\nSunset Mass: counts for Sunday" if sunset(b["start"]) else ""),
            f"<b>{esc(p['name'])}</b>" + (f"\n{esc(extra)}" if extra else ""),
            "",
            f"Leave by <b>{clock(b['leaveBy'])}</b> · {about}{mins(b['travelMin'])} {MODES[how][1]}{where}",
            "<i>That gets you there 5 minutes early, to settle in before Mass.</i>",
        ]
        alts = [a for a in res.get("alternatives") or [] if a]
        if alts:
            lines += ["", "<i>Also reachable:</i>"] + [
                f"{clock(a['start'])} {day_label(a['start'])}{sunset_note(a['start'])} · {esc(a['parish']['name'])} ({mins(a['travelMin'])})" for a in alts]
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
              [{"text": f"Open on {SITE_NAME}", "url": f"{SITE}/#/next?{build}&" + urllib.parse.urlencode({"from": place or "your location"})}]] + switch + mode_keyboard(mode, (lat, lng))
        return ("\n".join(lines), kb)

    # placeholder (already on screen) -> the live answer, or the estimate first when live is slow; each an edit
    shown = live_then_estimate(
        f"{SITE}/api/next?{build}", f"{SITE}/api/next?{build}&fast=1",
        lambda res: show(*paint(res, fast=False)),
        lambda res, final: show(*paint(res, fast=not final)),
        lambda: show("Sorry, I couldn't check Mass times just now. Please try again in a minute.", mode_keyboard(mode, (lat, lng))))
    if superseded():
        drop_placeholder(chat_id, own)
    return shown


def search_place(text):
    q = urllib.parse.urlencode({"searchVal": text, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": 1})
    res = http_json(f"https://www.onemap.gov.sg/api/common/elastic/search?{q}", timeout=6).get("results") or []
    if not res:
        return None
    x = res[0]
    name = x["BUILDING"] if x.get("BUILDING") not in (None, "", "NIL") else x["SEARCHVAL"]
    return float(x["LATITUDE"]), float(x["LONGITUDE"]), re.sub(r"\b(Mrt|Lrt|Nus|Ntu|Smu|Cbd|Hdb|[A-Za-z]{1,3}\d+)\b", lambda m: m.group(0).upper(), name.title())


LAST_SUNDAY = {}  # chat id -> whether the last answer was for Sunday (a Sunday or Sunset Mass)
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


def thank_for_feedback(msg, chat_id, text):
    try:
        send_feedback(msg, text)
    except Exception as e:  # noqa: BLE001 - say so rather than thank them for a message that went nowhere
        log.warning("feedback not sent: %s", e)
        return tg("sendMessage", chat_id=chat_id, text="Sorry, that didn't go through. Please try /feedback again in a moment.")
    return tg("sendMessage", chat_id=chat_id, text="Thank you! Anselm will read it.", reply_markup=LOCATION_KB)


def recompute_answer(chat_id, *spot, sunday=False, update_tapped=None):
    """Re-run answer() in the background so a filter tap never blocks the shared handler pool.

    The recompute inherits this update's chat/gen thread-locals, so a newer tap still supersedes
    the older one (and the newer one's answer is not overwritten). Returns immediately; the
    "Looking for..." loading edit is drawn inside answer() via update_tapped."""
    got = getattr(_here, "chat", None), getattr(_here, "gen", 0)
    RECOMPUTE_POOL.submit(
        lambda: _run_recompute(chat_id, spot, sunday=sunday, update_tapped=update_tapped, ctx=got))


def _run_recompute(chat_id, spot, sunday, update_tapped, ctx):
    _here.chat, _here.gen = ctx
    try:
        answer(chat_id, *spot, sunday=sunday, update_tapped=update_tapped)
    except Superseded:
        pass  # a newer tap took over; its answer will be drawn instead
    except Exception as e:  # noqa: BLE001
        log.exception("recompute failed: %s", e)
    finally:
        _here.chat = None


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
WAY = {}  # chat id -> {"step": "from"|"to"|"by", "from": (lat, lng, label), "to": (lat, lng, label), "at": started}
WAY_TTL_S = 10 * 60  # an "on the way" left half done is forgotten after this, so a later location is just a search
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

    def next_at(hh):
        t = now.replace(hour=hh, minute=mi, second=0, microsecond=0)
        return t + timedelta(days=1) if t <= now else t
    # "7" at 3pm means 7pm today, not 7am tomorrow: a bare 1-11 is whichever of am and pm comes sooner
    t = min(next_at(h), next_at(h + 12)) if not ap and 1 <= h <= 11 else next_at(h)
    return int(t.timestamp() * 1000)


def haversine_km(a, b):
    import math
    (la1, ln1), (la2, ln2) = (math.radians(a[0]), math.radians(a[1])), (math.radians(b[0]), math.radians(b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((ln2 - ln1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def way_start(chat_id):
    fresh = chat_id in LAST and time.time() - LAST_AT.get(chat_id, 0) < 30 * 60
    if fresh:
        WAY[chat_id] = {"step": "to", "from": LAST[chat_id], "at": time.time()}
        where = LAST[chat_id][2] or "where you shared"
        return tg("sendMessage", chat_id=chat_id, parse_mode="HTML",
                  text=f"Starting from <b>{esc(where)}</b>. Where are you heading? Send a postal code or place name.",
                  reply_markup={"inline_keyboard": [[{"text": "Start somewhere else", "callback_data": "way:from"}]]})
    WAY[chat_id] = {"step": "from", "at": time.time()}
    return tg("sendMessage", chat_id=chat_id,
              text="Where are you now? Tap Share my location, or send a postal code or place name.", reply_markup=LOCATION_KB)


def way_got_place(chat_id, place):
    w = WAY[chat_id]
    w["at"] = time.time()
    if w["step"] == "to" and w.get("from") and haversine_km(w["from"], place) < 0.3:
        return tg("sendMessage", chat_id=chat_id, text="That's where you're starting from. Where are you heading? Send a postal code or place name.",
                  reply_markup={"inline_keyboard": [[{"text": "Start somewhere else", "callback_data": "way:from"}]]})
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
        if superseded():
            return None
        extra = {"parse_mode": "HTML", "link_preview_options": {"is_disabled": True}, "reply_markup": {"inline_keyboard": kb}}
        if msg_id:
            try:
                return tg("editMessageText", chat_id=chat_id, message_id=msg_id, text=text, **extra)
            except Exception as e:  # noqa: BLE001 - "not modified" is fine; anything else: send it fresh
                if "not modified" in str(e):
                    return None
                log.warning("edit failed: %s", e)
        return tg("sendMessage", chat_id=chat_id, text=text, **extra)

    def paint(res, fast):
        b = res.get("best")
        if not b:
            why = f"that gets you to {esc(tlabel)} in time" if by_ms else f"on your way to {esc(tlabel)}"
            return (f"I couldn't find a Mass {why}. Try a later time, or another way of travelling.",
                    [[{"text": "Try it on the website", "url": site}]])
        p = b["parish"]
        about = "about " if b.get("travelSource") == "estimate" else ""
        to_how = MODES["walk" if b.get("toWalk") else mode][1]
        on_how = MODES["walk" if b.get("onwardWalk") else mode][1]
        # three plain steps, each a time: leave, Mass, arrive
        lines = [
            f"<b>{clock(b['start'])} {day_label(b['start'])}</b>" + ("\nSunset Mass: counts for Sunday" if sunset(b["start"]) else ""),
            f"<b>{esc(p['name'])}</b>",
            "",
            f"1. Leave {esc(flabel)} by <b>{clock(b['leaveBy'])}</b> ({about}{mins(b['toMin'])} {to_how})",
            f"2. Mass {clock(b['start'])} to about {clock(b['end'])}",
            f"3. Reach {esc(tlabel)} {about}<b>{clock(b['arrive'])}</b> ({about}{mins(b['onwardMin'])} {on_how})",
        ]
        alts = [a for a in res.get("alternatives") or [] if a]
        if alts:
            lines += ["", "<i>Also on the way:</i>"] + [
                f"{clock(a['start'])} {day_label(a['start'])} · {esc(a['parish']['name'])} (reach {esc(tlabel)} {clock(a['arrive'])})" for a in alts]
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
    if superseded():
        return drop_placeholder(chat_id, msg_id)
    maybe_nudge(chat_id)


def ack(cq, text=None):
    """Stop the button's spinner. Best effort: Telegram refuses (400 "query is too old") once a tap has
    waited too long, e.g. across a restart, and the tap must still change the answer."""
    if cq["id"] in ACKED and not cq.get("_force"):
        return  # the poll loop already answered this tap
    try:
        tg("answerCallbackQuery", callback_query_id=cq["id"], **({"text": text} if text else {}))
    except Exception as e:  # noqa: BLE001
        log.warning("answerCallbackQuery failed: %s", e)


def handle(update):
    if "callback_query" in update:
        cq = update["callback_query"]
        data = cq.get("data", "")
        chat_id = (cq.get("message") or {}).get("chat", {}).get("id")
        tapped = (cq.get("message") or {}).get("message_id")
        if not chat_id:
            return ack(cq, "Please send /start again.")
        AWAITING_FEEDBACK.discard(chat_id) if data != "fb:cancel" else None
        # mode and Sunday buttons carry the place of the answer they sit under ("mode:walk:1.35130,103.84920");
        # older buttons don't, and fall back to the chat's last search
        kind, _, rest = data.partition(":")
        val, _, where = rest.partition(":")
        spot = None
        if where:
            try:
                la, ln = (float(x) for x in where.split(","))
                last = LAST.get(chat_id)
                spot = (la, ln, last[2] if last and at_code(*last[:2]) == at_code(la, ln) else None)
            except ValueError:
                spot = None
        spot = spot or LAST.get(chat_id)
        if data == "way:from":
            ack(cq)
            WAY[chat_id] = {"step": "from", "at": time.time()}
            return tg("sendMessage", chat_id=chat_id, text="Where are you starting from? Tap Share my location, or send a postal code or place name.",
                      reply_markup=LOCATION_KB)
        if data.startswith("way:by:"):
            ack(cq)
            if chat_id not in WAY or WAY[chat_id].get("step") != "by":
                return tg("sendMessage", chat_id=chat_id, text=f"Tap {WAY_BUTTON} to start again.", reply_markup=LOCATION_KB)
            hours = int(data.rsplit(":", 1)[1] or 0)
            return way_answer(chat_id, int((time.time() + hours * 3600) * 1000) if hours else None)
        if kind == "sun" and val in ("0", "1"):
            if not spot:
                return tg("sendMessage", chat_id=chat_id, text="Share your location or send a postal code first.", reply_markup=LOCATION_KB)
            ack(cq, "Sunday or Sunset Mass" if val == "1" else "Any Mass")
            record(chat_id, "sunday")
            LAST[chat_id] = spot
            return recompute_answer(chat_id, *spot, sunday=val == "1", update_tapped=tapped)
        if data == "fb:cancel":
            AWAITING_FEEDBACK.discard(chat_id)
            return ack(cq, "No problem")
        if kind == "mode" and val in MODES:
            set_mode(chat_id, val)
            ack(cq, f"Travelling by {MODES[val][0]}")
            if spot:
                record(chat_id, "mode")
                LAST[chat_id] = spot
                recompute_answer(chat_id, *spot, sunday=LAST_SUNDAY.get(chat_id, False), update_tapped=tapped if where else None)
                maybe_nudge(chat_id)
            else:
                tg("sendMessage", chat_id=chat_id, text=f"Got it: {MODES[val][0]}. Now share your location or send a postal code.")
        else:
            ack(cq)
        return
    msg = update.get("message") or {}
    chat_id = msg.get("chat", {}).get("id")
    if not chat_id:
        return
    if WAY.get(chat_id) and time.time() - WAY[chat_id].get("at", 0) > WAY_TTL_S:
        WAY.pop(chat_id, None)  # an "on the way" left half done: start afresh
    if "location" in msg:
        AWAITING_FEEDBACK.discard(chat_id)
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
            return thank_for_feedback(msg, chat_id, said)
        AWAITING_FEEDBACK.add(chat_id)
        return tg("sendMessage", chat_id=chat_id,
                  text="What's on your mind? Send it as one message and I'll pass it straight to Anselm, who built MassGoWhere. "
                       "He'll see your Telegram name, so he can reply.",
                  reply_markup={"inline_keyboard": [[{"text": "Cancel", "callback_data": "fb:cancel"}]]})
    if chat_id in AWAITING_FEEDBACK and not text.startswith("/") and text != WAY_BUTTON:
        AWAITING_FEEDBACK.discard(chat_id)
        return thank_for_feedback(msg, chat_id, text)
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
        if by is not None:
            return way_answer(chat_id, by)
        WAY.pop(chat_id, None)  # not a time: they've moved on, so treat it as a new search
        w = None
    msg_id = placeholder(chat_id, f"Looking up “{text[:60]}”…")
    try:
        hit, trouble = search_place(text), False
    except Exception as e:  # noqa: BLE001
        log.warning("place search failed: %s", e)
        hit, trouble = None, True
    if superseded():
        return drop_placeholder(chat_id, msg_id)
    if not hit:
        not_found = ("I couldn't search for places just now. Please try again in a moment, or share your location." if trouble
                     else f"I couldn't find “{text[:60]}”. Try a postal code, MRT station or street name.")
        if msg_id:
            try:
                return tg("editMessageText", chat_id=chat_id, message_id=msg_id, text=not_found)
            except Exception as e:  # noqa: BLE001
                log.warning("edit failed: %s", e)
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


ACKED = set()  # callback ids already answered (the poll loop acks every tap at once)


def asks_for_answer(u):
    """does this update start a new answer (so an older one still loading for the chat can stop)?"""
    if "callback_query" in u:
        return (u["callback_query"].get("data") or "").split(":")[0] in ("mode", "sun", "way")
    m = u.get("message") or {}
    t = (m.get("text") or "").strip()
    return "location" in m or (bool(t) and not t.startswith("/"))


def ack_at_once(u):
    """Telegram shows a spinner on a tapped button until it's answered: answer straight away, with the same
    short note handle() would give, so a tap never looks ignored while an earlier answer is still loading."""
    cq = u.get("callback_query")
    if not cq:
        return
    data = cq.get("data") or ""
    kind, _, rest = data.partition(":")
    val = rest.split(":")[0]
    text = (f"Travelling by {MODES[val][0]}" if kind == "mode" and val in MODES
            else "Sunday or Sunset Mass" if kind == "sun" and val == "1" else "Any Mass" if kind == "sun"
            else "No problem" if data == "fb:cancel" else None)
    ACKED.add(cq["id"])
    LIVE_POOL.submit(lambda: ack({"id": cq["id"], "_force": True}, text))


def safe_handle(u):
    # one chat's updates run in order (tapping Car then Walk must end on Walk); different chats run in parallel.
    # An update that starts a new answer has already bumped GEN, so an older answer holding the lock lets go fast.
    chat = chat_of(u)
    lock = CHAT_LOCKS.setdefault(chat, threading.Lock())
    try:
        with lock:
            _here.chat, _here.gen = chat, u.get("_gen", GEN.get(chat, 0))
            if superseded():
                return  # a newer answer for this chat is already on its way
            handle(u)
    except Exception:  # noqa: BLE001 - one bad update must not stop the bot
        log.exception("failed to handle update %s", u.get("update_id"))
    finally:
        _here.chat = None


def main():
    try:
        tg("setMyCommands", commands=[{"command": "start", "description": "Find a Mass you can attend"},
                                      {"command": "mode", "description": "Change how you're travelling"},
                                      {"command": "feedback", "description": "Tell Anselm what's working or not"}])
    except Exception as e:  # noqa: BLE001 - not needed to serve users
        log.warning("setMyCommands failed: %s", e)
    pool = cf.ThreadPoolExecutor(max_workers=12)  # one slow answer must not hold up other chats
    offset = None
    log.info("bot started, api=%s", SITE)
    while True:
        try:
            params = {"timeout": 30, "allowed_updates": ["message", "callback_query"]}
            if offset is not None:
                params["offset"] = offset
            for u in http_json(f"{TG}/getUpdates", params, timeout=45).get("result", []):
                offset = u["update_id"] + 1
                ack_at_once(u)
                chat = chat_of(u)
                if asks_for_answer(u):
                    GEN[chat] = GEN.get(chat, 0) + 1
                u["_gen"] = GEN.get(chat, 0)
                pool.submit(safe_handle, u)
        except Exception as e:  # noqa: BLE001 - dropped connections, SSL errors, bad JSON: back off and keep polling
            log.warning("polling error: %s: %s", type(e).__name__, e)
            time.sleep(5)


if __name__ == "__main__":
    main()
