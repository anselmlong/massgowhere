"""MassGoWhere Telegram bot: share your location (or send a postal code), get the Mass you can make.

No dependencies: long-polls the Telegram Bot API and asks mass.anselmlong.com/api/next for the answer,
so the bot always says exactly what the website says.

Run: python3 bot/bot.py      (reads TELEGRAM_BOT_TOKEN from .env; MASSGOWHERE_API overrides the site URL)
"""
import concurrent.futures as cf
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
SITE = os.environ.get("MASSGOWHERE_API", "https://mass.anselmlong.com").rstrip("/")
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


LOCATION_KB = {"keyboard": [[{"text": "Share my location", "request_location": True}]], "resize_keyboard": True, "is_persistent": True,
               "input_field_placeholder": "Or type a postal code or place"}

WELCOME = ("<b>MassGoWhere</b> finds a Mass in Singapore you can actually make, and tells you when to leave.\n\n"
           "Tap <b>Share my location</b> below, or send a postal code or place name.\n"
           "Travelling by: <b>{mode}</b> (change it with the buttons).")


# ---------- answers ----------

def in_singapore(lat, lng):
    # same rough box as api/next.js; a box cannot fully separate Woodlands from Johor Bahru, the API is the last word
    return 1.15 < lat < 1.475 and 103.59 < lng < 104.1


def answer(chat_id, lat, lng, place=None):
    mode = mode_for(chat_id)
    if not in_singapore(lat, lng):
        return tg("sendMessage", chat_id=chat_id, text="That location isn't in Singapore. MassGoWhere only covers Singapore's parishes; "
                  "send a Singapore postal code or place name instead.")
    tg("sendChatAction", chat_id=chat_id, action="find_location")
    build = urllib.parse.urlencode({"lat": f"{lat:.5f}", "lng": f"{lng:.5f}", "mode": mode})

    def paint(res, fast):
        """(text, keyboard) for an /api/next payload. fast -> "about" flagged on estimates."""
        b = res.get("best")
        where = f" from {esc(place)}" if place else ""
        if not b:
            return ("I couldn't find a Mass you can reach in the next two days{where} {mode}. Try another way of travelling.".format(
                        where=where, mode=MODES[mode][1]),
                    {"inline_keyboard": mode_keyboard(mode) + [[{"text": "Browse all churches", "url": f"{SITE}/#/churches"}]]})
        p = b["parish"]
        about = "about " if b.get("travelSource") == "estimate" else ""
        extra = " · ".join(x for x in [f"{b['language']} Mass" if b.get("language") and b["language"] != "English" else "", b.get("note") or ""] if x)
        lines = [
            f"<b>{clock(b['start'])} {day_label(b['start'])}</b>",
            f"<b>{esc(p['name'])}</b>" + (f"\n{esc(extra)}" if extra else ""),
            "",
            f"Leave by <b>{clock(b['leaveBy'])}</b> · {about}{mins(b['travelMin'])} {MODES[mode][1]}{where}",
        ]
        alts = [a for a in res.get("alternatives") or [] if a]
        if alts:
            lines += ["", "<i>Also reachable:</i>"] + [
                f"{clock(a['start'])} {day_label(a['start'])} · {esc(a['parish']['name'])} ({mins(a['travelMin'])})" for a in alts]
        near = res.get("nearest")
        if near and near["parish"]["id"] != p["id"]:
            nn = near.get("next")
            when = f", next Mass you can make {clock(nn['start'])} {day_label(nn['start'])}" if nn else ""
            lines += ["", f"<i>Nearest church:</i> {esc(near['parish']['name'])} ({mins(near['travelMin'])}{when})"]
        if fast:
            lines += ["", "<i>Refining live travel times…</i>"]
        if res.get("specialDay"):
            lines += ["", f"<i>{esc(res['specialDay'])}: Mass times often change today. Please check with the parish.</i>"]
        lines += ["", "Go in peace."]
        kb = [[{"text": "Navigate", "url": gmaps(p, mode, lat, lng)}],
              [{"text": "Mass times at this church", "url": f"{SITE}/#/church/{p['id']}"}]] + mode_keyboard(mode)
        return ("\n".join(lines), kb)

    def send(text, kb):
        return tg("sendMessage", chat_id=chat_id, parse_mode="HTML", text=text, reply_markup={"inline_keyboard": kb},
                  link_preview_options={"is_disabled": True})

    # 1) instant estimate answer, then 2) refine with exact OneMap times via an edit
    msg = None
    try:
        res = http_json(f"{SITE}/api/next?{build}&fast=1", timeout=15)
        text, kb = paint(res, fast=True)
        msg = send(text, kb)
    except Exception as e:  # noqa: BLE001
        log.warning("fast api error: %s", e)
    try:
        res = http_json(f"{SITE}/api/next?{build}", timeout=15)
        text, kb = paint(res, fast=False)
        if msg:
            tg("editMessageText", chat_id=chat_id, message_id=msg["result"]["message_id"],
               parse_mode="HTML", text=text, reply_markup={"inline_keyboard": kb},
               link_preview_options={"is_disabled": True})
        else:
            send(text, kb)
    except Exception as e:  # noqa: BLE001
        log.warning("api error: %s", e)
        if not msg:
            return send("Sorry, I couldn't check Mass times just now. Please try again in a minute.",
                        {"inline_keyboard": mode_keyboard(mode)})


def search_place(text):
    q = urllib.parse.urlencode({"searchVal": text, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": 1})
    res = http_json(f"https://www.onemap.gov.sg/api/common/elastic/search?{q}", timeout=15).get("results") or []
    if not res:
        return None
    x = res[0]
    name = x["BUILDING"] if x.get("BUILDING") not in (None, "", "NIL") else x["SEARCHVAL"]
    return float(x["LATITUDE"]), float(x["LONGITUDE"]), re.sub(r"\b(Mrt|Lrt|Nus|Ntu|Smu|Cbd|Hdb|[A-Za-z]{1,3}\d+)\b", lambda m: m.group(0).upper(), name.title())


LAST = {}  # chat id -> (lat, lng, place) of the last query, in memory only, to redo it after a mode change


def handle(update):
    if "callback_query" in update:
        cq = update["callback_query"]
        data = cq.get("data", "")
        chat_id = (cq.get("message") or {}).get("chat", {}).get("id")
        if not chat_id:
            return tg("answerCallbackQuery", callback_query_id=cq["id"], text="Please send /start again.")
        if data.startswith("mode:") and data[5:] in MODES:
            set_mode(chat_id, data[5:])
            tg("answerCallbackQuery", callback_query_id=cq["id"], text=f"Travelling by {MODES[data[5:]][0]}")
            if chat_id in LAST:
                answer(chat_id, *LAST[chat_id])
            else:
                tg("sendMessage", chat_id=chat_id, text=f"Got it: {MODES[data[5:]][0]}. Now share your location or send a postal code.")
        else:
            tg("answerCallbackQuery", callback_query_id=cq["id"])
        return
    msg = update.get("message") or {}
    chat_id = msg.get("chat", {}).get("id")
    if not chat_id:
        return
    if "location" in msg:
        loc = msg["location"]
        LAST[chat_id] = (loc["latitude"], loc["longitude"], None)
        return answer(chat_id, loc["latitude"], loc["longitude"])
    text = (msg.get("text") or "").strip()
    if not text:
        return
    if text.startswith("/start") or text.startswith("/help"):
        return tg("sendMessage", chat_id=chat_id, parse_mode="HTML", text=WELCOME.format(mode=MODES[mode_for(chat_id)][0]),
                  reply_markup=LOCATION_KB)
    if text.startswith("/mode"):
        return tg("sendMessage", chat_id=chat_id, text="How are you travelling?", reply_markup={"inline_keyboard": mode_keyboard(mode_for(chat_id))})
    if text.startswith("/"):
        return tg("sendMessage", chat_id=chat_id, text="Share your location, or send a postal code or place name.", reply_markup=LOCATION_KB)
    try:
        hit = search_place(text)
    except Exception:  # noqa: BLE001 - search trouble reads the same as "not found"
        hit = None
    if not hit:
        return tg("sendMessage", chat_id=chat_id, text=f"I couldn't find “{text[:60]}”. Try a postal code, MRT station or street name.")
    LAST[chat_id] = hit
    answer(chat_id, *hit)


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
        tg("setMyCommands", commands=[{"command": "start", "description": "Find a Mass you can make"},
                                      {"command": "mode", "description": "Change how you're travelling"}])
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
