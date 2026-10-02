"""Read each parish's own website and extract its schedule with an LLM (via OpenRouter).

Usage:
  python3 scripts/scrape_parishes.py                 # all parishes -> data/parishes/<id>.json
  python3 scripts/scrape_parishes.py --only 5,6 --models a/x,b/y --out /tmp/x
  python3 scripts/scrape_parishes.py --force         # accept big changes without the safety check
  python3 scripts/scrape_parishes.py --bulletin-only --only 5,6   # read this week's bulletin alone (the weekly job)

One cheap model reads each page (several may be given with --models; they then vote, and a slot they
disagree on is kept only if myCatholicSG lists it). Every result is also compared with myCatholicSG and the
differences are recorded for review; the comparison never drops anything on its own.
A parish keeps its previous good file when fetching/extraction fails or the result looks wrong.
Exit code is 0 even with warnings; warnings are printed and written to data/parishes/_report.json.
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import html as htmllib
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SGT = dt.timezone(dt.timedelta(hours=8))
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36"}
TIME_RE = re.compile(r"\b(1[0-2]|0?[1-9])([:.][0-5]\d)?\s*(am|pm|a\.m\.|p\.m\.)", re.I)
DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
TYPES = ["Mass", "Confession", "Adoration", "Devotion", "Other"]
DEFAULT_MODELS = "deepseek/deepseek-v4.1-flash"
REQUEST_DEADLINE_S = 120  # hard cap per model call; OpenRouter keep-alives defeat plain socket timeouts


def load_env():
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for line in open(path):
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.rstrip("\n").split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


# ---------- fetching ----------

def page_text(html):
    # keep hidden tab panels: take all text, not just what's visible
    html = re.sub(r"(?is)<(script|style|noscript|svg|template)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d|section)>", "\n", html)
    text = htmllib.unescape(re.sub(r"<[^>]+>", " ", html))
    return "\n".join(re.sub(r"[ \t\xa0​]+", " ", l).strip() for l in text.splitlines() if l.strip())


def fetch_static(url):
    r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25, context=ssl.create_default_context())
    return page_text(r.read().decode(r.headers.get_content_charset() or "utf-8", "replace"))


def fetch_rendered(url):
    from playwright.sync_api import sync_playwright  # optional dependency, only for JS-built sites

    with sync_playwright() as p:
        b = p.chromium.launch(args=["--disable-dev-shm-usage"])
        try:
            pg = b.new_page(user_agent=UA["User-Agent"])
            pg.goto(url, wait_until="domcontentloaded", timeout=30000)
            pg.wait_for_timeout(3000)
            return page_text(pg.content())
        finally:
            b.close()


def fetch(url):
    try:
        text = fetch_static(url)
    except urllib.error.HTTPError:  # some sites 403 plain clients but serve a real browser
        return fetch_rendered(url), "rendered"
    if len(TIME_RE.findall(text)) >= 3:
        return text, "static"
    return fetch_rendered(url), "rendered"


# ---------- the latest weekly bulletin ----------
# Deterministic: data/bulletins.json names the page that links a parish's bulletins; the newest date written in a link
# (or its text) wins, else the first PDF. A PDF is read with pdftotext; only the reading of its text uses the LLM.

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def link_date(s):
    """Latest plausible date written in a link or its text: 2026-09-27, 20260927, 27 Sep 2026, 26-27-september-2026, 27sep26, 0927-2026."""
    s, found = s.lower(), []
    for y, m, d in re.findall(r"(?<!\d)(20\d\d)[-_/.]?(0[1-9]|1[0-2])[-_/.]?(0[1-9]|[12]\d|3[01])(?!\d)", s):
        found.append((y, m, d))
    for d, mon, y in re.findall(r"(?<!\d)(\d{1,2})(?:st|nd|rd|th)?[-_ ]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[-_ ,]*(20\d\d|\d\d)(?!\d)", s):
        found.append((y if len(y) == 4 else "20" + y, MONTHS.index(mon) + 1, d))
    for mon, d, y in re.findall(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_ ]+(?:\d{1,2}[-_ ]+)?(\d{1,2})[-_ ,]+(20\d\d)(?!\d)", s):
        found.append((y, MONTHS.index(mon) + 1, d))
    for m, d, y in re.findall(r"(?<!\d)(0[1-9]|1[0-2])([0-2]\d|3[01])[-_](20\d\d)(?!\d)", s):
        found.append((y, m, d))
    latest = dt.datetime.now(SGT).date() + dt.timedelta(days=10)
    out = []
    for ms in re.findall(r"[?&]t=(1[6-9]\d{11})(?!\d)", s):  # a newsletter link's send time (St Michael's), epoch ms
        d = dt.datetime.fromtimestamp(int(ms) / 1000, SGT).date()
        found.append((d.year, d.month, d.day))
    for y, m, d in found:
        try:
            day = dt.date(int(y), int(m), int(d))
        except ValueError:
            continue
        if day <= latest:
            out.append(day)
    return max(out) if out else None


def fetch_html(url, rendered=False):
    try:
        if rendered:
            raise urllib.error.HTTPError(url, 0, "rendered", None, None)
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25, context=ssl.create_default_context())
        html = r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
        if len(re.findall(r"(?i)<a\b", html)) >= 5:
            return html
    except urllib.error.HTTPError:
        pass
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        b = p.chromium.launch(args=["--disable-dev-shm-usage"])
        try:
            pg = b.new_page(user_agent=UA["User-Agent"])
            pg.goto(url, wait_until="domcontentloaded", timeout=30000)
            pg.wait_for_timeout(3000)
            # a Drive file shown in a frame inside an embedded app (Risen Christ's bulletin page) counts as a link,
            # named by its frame's title ("20260927_Bulletin.pdf - Google Drive")
            if any("script.google.com" in f.url or "drive.google.com" in f.url for f in pg.frames):
                pg.wait_for_timeout(5000)
            framed = ""
            for f in pg.frames:
                m = re.search(r"drive\.google\.com/file/d/([\w-]+)", f.url)
                if m:
                    try:
                        title = f.title()
                    except Exception:  # noqa: BLE001 - a frame that went away has no title
                        title = ""
                    framed += f'<a href="https://drive.google.com/file/d/{m.group(1)}/view">{htmllib.escape(title)}</a>'
            return pg.content() + framed
        finally:
            b.close()


# an emailed newsletter's web copy (St Michael's bulletin is one)
NEWSLETTER = re.compile(r"sendinblue\.com|brevo\.com|mailchi\.mp|campaign-archive\.com", re.I)


def is_pdf(u):
    return u.lower().split("?")[0].endswith(".pdf") or "drive.google.com/file/d/" in u


def pick_bulletin(url, html):
    """(link, date) of the newest bulletin linked from a page; date may be None. An embedded Google Drive folder
    (plain HTML at drive.google.com/embeddedfolderview) is read as part of the page."""
    from urllib.parse import urljoin

    for fid in re.findall(r"drive\.google\.com/embeddedfolderview\?id=([\w-]+)", html)[:2]:
        try:
            html += fetch_html(f"https://drive.google.com/embeddedfolderview?id={fid}")
        except Exception:  # noqa: BLE001 - the page's own links still count
            pass
    from urllib.parse import quote

    links = [(quote(urljoin(url, htmllib.unescape(h)), safe=":/?&=%#+,;@~"), page_text(t)) for h, t in re.findall(r"""(?is)<a\b[^>]*href=["']([^"'#]+)["'][^>]*>(.*?)</a>""", html)]
    cands = [(h, t) for h, t in links if h.startswith("http") and h.rstrip("/") != url.rstrip("/")
             and (is_pdf(h) or NEWSLETTER.search(h) or re.search(r"bulletin|newsletter|leaven|voice", h + " " + t, re.I))
             and not re.search(r"/(category|tag|page)/|facebook|instagram|youtube|mailto", h, re.I)]
    named = [(h, t) for h, t in cands if NEWSLETTER.search(h) or re.search(r"bulletin|newsletter|leaven|voice", h + " " + t, re.I)]
    if not named:  # a PDF behind an image or a bare "Download" button, under a heading that says bulletin
        for m in re.finditer(r"""(?is)<a\b[^>]*href=["']([^"'#]+)["']""", html):
            h = quote(urljoin(url, htmllib.unescape(m.group(1))), safe=":/?&=%#+,;@~")
            if is_pdf(h) and re.search(r"bulletin", page_text(html[max(0, m.start() - 800):m.end() + 200]), re.I):
                named = [(h, "")]
                break
    # a dated link wins (newest first); else an undated PDF that calls itself a bulletin. Never guess from other PDFs
    # (privacy policies, reflections, forms).
    dated = sorted(((link_date(h + " " + t) or dt.date.min, -i, h) for i, (h, t) in enumerate(named or cands)), reverse=True)
    if dated and dated[0][0] > dt.date.min:
        return dated[0][2], dated[0][0]
    pdf = next((h for h, _ in named if is_pdf(h)), None)
    return (pdf, None) if pdf else (None, None)


def pdf_text(u):
    import subprocess
    import tempfile

    m = re.search(r"drive\.google\.com/file/d/([\w-]+)", u)
    if m:
        u = f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    u = u.replace("://www.dropbox.com/", "://dl.dropboxusercontent.com/")  # www serves a browser an HTML preview
    data = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90, context=ssl.create_default_context()).read()
    if not data.startswith(b"%PDF"):
        raise ValueError("not a PDF")
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(data)
        f.flush()
        return subprocess.run(["pdftotext", f.name, "-"], capture_output=True, text=True, timeout=60, check=True).stdout


def announcements(url, days=21):
    """{url, date, text, kind} from a Squarespace announcements page (St Mary of the Angels posts its news there instead
    of a bulletin): the posts of the last `days` days, newest first, as one text. None when the page is not one."""
    try:
        r = urllib.request.urlopen(urllib.request.Request(url.split("?")[0] + "?format=json", headers=UA), timeout=25,
                                   context=ssl.create_default_context())
        items = json.load(r).get("items") or []
    except (urllib.error.URLError, ValueError):
        return None
    posts = [i for i in items if i.get("publishOn") and i.get("title")]
    if not posts:
        return None
    day = lambda i: dt.datetime.fromtimestamp(i["publishOn"] / 1000, SGT).date()
    newest = max(day(i) for i in posts)
    recent = [i for i in posts if day(i) >= newest - dt.timedelta(days=days)]
    text = "\n\n".join(f"{htmllib.unescape(i['title'])} (posted {day(i).isoformat()})\n{page_text(i.get('excerpt') or '')}\n{page_text(i.get('body') or '')}"
                       for i in recent)
    return {"url": url, "date": newest.isoformat(), "text": text, "kind": "announcements"}


def latest_bulletin(url):
    """{url, date, text} of the newest bulletin linked from url. A bulletin that is a web page with a PDF on it reads the PDF.
    A parish that posts announcements instead (a Squarespace collection) gets those."""
    link, date = pick_bulletin(url, fetch_html(url))
    if not link:  # a page of posts in place of a bulletin (one quick request, before a browser is started)
        posts = announcements(url)
        if posts:
            return posts
    if not link:  # links added by the page's scripts
        link, date = pick_bulletin(url, fetch_html(url, rendered=True))
    if not link:
        raise ValueError("no bulletin link found")
    if not is_pdf(link):
        html = fetch_html(link)
        pdf = next((h for h, _ in [(u, "") for u in re.findall(r"""href=["']([^"']+\.pdf)["']""", html, re.I)]), None)
        if pdf:
            from urllib.parse import urljoin

            link, date = urljoin(link, pdf), date or link_date(pdf)
        else:
            text = page_text(html)
            return {"url": link, "date": (date or "") and date.isoformat(), "text": text}
    text = pdf_text(link)
    if len(text.strip()) < 200:
        raise ValueError("bulletin has no text (an image?)")
    # an undated link (a Drive file): the bulletin's own first page says which Sunday it is for
    date = date or link_date(text[:1500])
    return {"url": link, "date": (date or "") and date.isoformat(), "text": text}


def bulletin_text(u):
    """The text of a bulletin found earlier (data/bulletins_latest.json): a PDF, or a newsletter web page."""
    if is_pdf(u) or "firebasestorage.googleapis.com" in u:
        text = pdf_text(u)
    else:
        text = (announcements(u) or {}).get("text") or page_text(fetch_html(u))
    if len(text.strip()) < 200:
        raise ValueError("bulletin has no text (an image?)")
    return text


# ---------- extraction ----------

ENTRY = {
    "type": "object",
    "additionalProperties": False,
    "required": ["type", "day", "time", "weeks", "except_weeks", "language", "location", "note"],
    "properties": {
        "type": {"type": "string", "enum": TYPES},
        "day": {"type": "string", "enum": DAYS},
        "time": {"type": "string", "description": "24-hour HH:MM start time"},
        "weeks": {"type": "array", "items": {"type": "integer"},
                  "description": "Which occurrences of this weekday in the month: [] = every week; 1-5 = 1st..5th; -1 = last"},
        "except_weeks": {"type": "array", "items": {"type": "integer"},
                         "description": "Occurrences when this does NOT happen, e.g. [1] for 'except 1st Friday'; [] if none"},
        "language": {"type": "string"},
        "location": {"type": "string", "description": "e.g. 'Main Church', 'Chapel'; '' if not stated"},
        "note": {"type": "string", "description": "short qualifier worth showing, e.g. 'Sunset Mass', 'followed by Adoration'; '' if none"},
    },
}
DATED = {
    "type": "object",
    "additionalProperties": False,
    "required": ["type", "date", "time", "language", "location", "title", "action"],
    "properties": {
        "type": {"type": "string", "enum": TYPES},
        "date": {"type": "string", "description": "YYYY-MM-DD"},
        "time": {"type": "string", "description": "24-hour HH:MM"},
        "language": {"type": "string"},
        "location": {"type": "string"},
        "title": {"type": "string", "description": "e.g. 'Christmas Eve Vigil Mass', 'Feast of St Francis'"},
        "action": {"type": "string", "enum": ["add", "cancel"],
                   "description": "add = an extra/special service; cancel = a regular service that will not happen that day"},
    },
}
# what a visitor wants to know beyond Mass times, in the parish's own words (shown on the church page as is)
INFO = {
    "type": "object",
    "additionalProperties": False,
    "required": ["adoration", "confession", "devotions", "office_hours", "good_to_know"],
    "properties": {
        "adoration": {"type": "string", "description": "when Adoration is available, including an Adoration room/chapel's opening hours "
                      "and any Holy Hour, e.g. 'Adoration Room open daily 7am-10pm. Holy Hour: Thursdays 8pm.' '' if not stated"},
        "confession": {"type": "string", "description": "when Confession is heard, e.g. '15 min before every weekend Mass; Saturdays 4-5pm'. '' if not stated"},
        "devotions": {"type": "array", "items": {"type": "string"},
                      "description": "regular devotions with day and time, e.g. 'Novena to Our Lady of Perpetual Help: Saturdays 9am' (max 6)"},
        "office_hours": {"type": "string", "description": "parish office opening hours, e.g. 'Tue-Sun 9am-5pm; closed Mondays'. '' if not stated"},
        "good_to_know": {"type": "array", "items": {"type": "string"},
                         "description": "at most 4 practical facts for a visitor: church opening hours, parking, access, dress code. "
                                        "Never Mass times (they are elsewhere), never events or fundraising."},
    },
}

EVENT = {
    "type": "object",
    "additionalProperties": False,
    "required": ["date", "time", "title", "text"],
    "properties": {
        "date": {"type": "string", "description": "YYYY-MM-DD"},
        "time": {"type": "string", "description": "24-hour HH:MM start, '' if not stated"},
        "title": {"type": "string"},
        "text": {"type": "string", "description": "one or two short sentences: where, who it is for, how to sign up"},
    },
}

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["has_schedule", "regular", "dated", "no_weekday_mass_on_public_holidays", "public_holiday_masses", "notes", "info", "events"],
    "properties": {
        "has_schedule": {"type": "boolean", "description": "true only if the page states this parish's regular Mass times"},
        "regular": {"type": "array", "items": ENTRY},
        "dated": {"type": "array", "items": DATED},
        "no_weekday_mass_on_public_holidays": {"type": "boolean"},
        "public_holiday_masses": {"type": "array", "items": {"type": "string"},
                                  "description": "HH:MM times of Masses held on public holidays, if the page says so; [] otherwise"},
        "info": INFO,
        "events": {"type": "array", "items": EVENT,
                   "description": "parish events a visitor could go to, dated today or later (max 12): talks, retreats, feasts, courses"},
        "notes": {"type": "array", "items": {"type": "string"},
                  "description": "short schedule caveats worth showing a visitor (max 3)"},
    },
}

PROMPT = """You extract a Catholic parish's service schedule from the text of its website.
Today is {today} (Singapore). Parish: {name}. Page: {url}

Rules:
- Only use what the page states. Never guess or fill in typical times. If the page has no Mass times for this parish, set has_schedule=false and leave lists empty.
- "regular": one entry per weekday per time. Expand ranges: "Mon-Fri 6.30am" is five entries. Saturday evening "sunset"/anticipated Masses are Saturday entries.
- Times: 24-hour HH:MM. "12pm"/"noon" = 12:00. "8am" = 08:00. A midnight Mass belonging to the evening of date D is date D, time 23:59.
- weeks / except_weeks: "3rd Saturday only" -> weeks [3]; "last Sunday" -> weeks [-1]; "Mon-Fri 6pm except 1st Friday" -> except_weeks [1] on the Friday entry, plus a separate Friday entry with weeks [1] if another time is given for that week.
- A Mass whose language differs in certain weeks ("Tagalog, except 3rd Sunday in English") becomes two entries using weeks/except_weeks.
- language: the language of the Mass; use "English" when the page says Masses are English unless stated otherwise, or states nothing.
- Masses listed only for public holidays go in public_holiday_masses, never in "regular".
- type is what the item itself is, not the heading it sits under: "Novena", "Rosary", "Divine Mercy", "Stations" are Devotion; "Adoration"/"Holy Hour" are Adoration; "Confession"/"Reconciliation" are Confession. Only a Mass is Mass.
- Include Confession, Adoration and devotions (Novena, Rosary, Divine Mercy...) only when a specific start time is given. Skip office hours, columbarium hours, livestream-only broadcasts, and events that are not services.
- "dated": one-off services or cancellations with an explicit date on or after today (e.g. feast days, Christmas, "no 7am Mass on 3 Oct"). Skip past dates.
- info: what else a visitor would want, in short plain sentences, only as the page states it. An Adoration room or chapel that is open for hours is described in info.adoration with its opening hours; a "Holy Hour" is a set time of prayer, so say "Holy Hour" and its time, not "Adoration at" that time. Leave a field '' (or []) when the page doesn't say.
- The text may end with the parish's latest weekly bulletin (marked [bulletin ...]). It is the most current source: use it for "dated" (one-off Masses, changed or cancelled Masses) and "events". Regular Mass times come from the website pages unless the bulletin states a new regular schedule.
- events: talks, retreats, courses, feasts, gatherings open to parishioners, dated today or later; not Masses (those go in "dated"), not appeals, not prayers.
- info and events are shown to visitors word for word: write to the visitor about the parish, never about your sources or your reading of them. Don't mention the homepage, footer, poster, image, article or excerpt, and don't write "explicitly", "verify", "appears to" or "conflict". When the bulletin and the website give different times, give both briefly and end with "check with the parish", e.g. "The bulletin says 07:30, the website 07:00; check with the parish."
- notes: at most 3 short caveats a visitor needs, e.g. "No weekday Mass on public holidays". Never describe the page itself, never restate times or languages already in the entries, never say what is missing. Empty is fine.

Page text:
<<<
{text}
>>>"""


def with_deadline(fn, seconds, *args):
    """Run fn in a daemon thread; raise TimeoutError if it has not returned in time (the thread is abandoned)."""
    import queue
    import threading

    q = queue.Queue()
    threading.Thread(target=lambda: q.put(_try(fn, *args)), daemon=True).start()
    try:
        ok, val = q.get(timeout=seconds)
    except queue.Empty:
        raise TimeoutError(f"no answer in {seconds}s") from None
    if ok:
        return val
    raise val


def _try(fn, *args):
    try:
        return True, fn(*args)
    except Exception as e:  # noqa: BLE001 - re-raised by with_deadline in the caller's thread
        return False, e


def extract(name, url, text, model):
    last = None
    for _ in range(2):  # one retry
        try:
            return with_deadline(_extract, REQUEST_DEADLINE_S, name, url, text, model)
        except (TimeoutError, urllib.error.URLError, json.JSONDecodeError, KeyError) as e:
            last = e
    raise last


def _extract(name, url, text, model):
    body = {
        "model": model,
        "temperature": 0,
        "messages": [{"role": "user", "content": PROMPT.format(
            today=dt.datetime.now(SGT).date().isoformat(), name=name, url=url, text=text[:52000])}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "parish_schedule", "strict": True, "schema": SCHEMA}},
        "provider": {"require_parameters": True},
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json",
                 "HTTP-Referer": "https://massgowhere.com", "X-Title": "MassGoWhere"})
    r = json.load(urllib.request.urlopen(req, timeout=180))
    content = r["choices"][0]["message"]["content"]
    return json.loads(content), r.get("usage", {})


# ---------- validation ----------

def validate(res):
    """Return (clean result, problems). Drops malformed entries rather than guessing."""
    problems = []
    ok = []
    for e in res.get("regular", []):
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", e["time"]):
            problems.append(f"bad time {e['time']!r}")
            continue
        weeks = [w for w in e["weeks"] if w in (-1, 1, 2, 3, 4, 5)]
        exc = [w for w in e["except_weeks"] if w in (-1, 1, 2, 3, 4, 5)]
        ok.append({**e, "weeks": sorted(set(weeks)), "except_weeks": sorted(set(exc)),
                   "language": e["language"].strip() or "English", "location": e["location"].strip(), "note": e["note"].strip()})
    res["public_holiday_masses"] = [t for t in res.get("public_holiday_masses", []) if re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", t)]
    today = dt.datetime.now(SGT).date().isoformat()
    dated = [d for d in res.get("dated", []) if re.fullmatch(r"\d{4}-\d\d-\d\d", d["date"]) and d["date"] >= today
             and re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", d["time"])]
    res = {**res, "regular": ok, "dated": dated}
    masses = [e for e in ok if e["type"] == "Mass"]
    if res.get("has_schedule") and not any(e["day"] == "Sunday" for e in masses):
        problems.append("no Sunday Mass found")
    return res, problems


def clean_events(events):
    today = dt.datetime.now(SGT).date().isoformat()
    one = lambda v, n: re.sub(r"\s+", " ", str(v or "")).strip()[:n]
    out = [{"date": e["date"], "time": e["time"] if re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", e.get("time") or "") else "",
            "title": one(e.get("title"), 120), "text": one(e.get("text"), 300)}
           for e in events or [] if re.fullmatch(r"\d{4}-\d\d-\d\d", e.get("date") or "") and e["date"] >= today and e.get("title")]
    return sorted(out, key=lambda e: (e["date"], e["time"]))[:12]


def clean_info(info):
    """Trim the free-text parish info: short strings only, capped lists, empties dropped."""
    info = info or {}
    one = lambda v: re.sub(r"\s+", " ", str(v or "")).strip()[:240]
    many = lambda v, n: [x for x in (one(i) for i in (v or [])) if x][:n]
    out = {"adoration": one(info.get("adoration")), "confession": one(info.get("confession")),
           "devotions": many(info.get("devotions"), 6), "office_hours": one(info.get("office_hours")),
           "good_to_know": many(info.get("good_to_know"), 4)}
    return {k: v for k, v in out.items() if v}


def grounded(e, text, mc_rules, holidays):
    """Keep a one-off change only when the page or bulletin says it: its date and start time are written within a few
    hundred characters of each other, within the next 45 days; a cancellation must hit a myCatholicSG slot and say
    no/cancelled/moved nearby; a "public holiday" Mass must fall on one. Models invent these otherwise."""
    try:
        day = dt.date.fromisoformat(e["date"])
    except ValueError:
        return False
    today = dt.datetime.now(SGT).date()
    if not today <= day <= today + dt.timedelta(days=45):
        return False
    if re.search(r"public holiday", e.get("title", ""), re.I) and e["date"] not in holidays:
        return False
    mon = MONTHS[day.month - 1]
    dates = [rf"\b0?{day.day}(st|nd|rd|th)?\s*(of\s*)?{mon}", rf"\b{mon}[a-z]*\.?\s*0?{day.day}\b", rf"\b0?{day.day}/0?{day.month}\b"]
    h, m = map(int, e["time"].split(":"))
    h12 = h % 12 or 12
    times = [rf"\b{h:02d}[:.]?{m:02d}\b", rf"\b{h}[:.]{m:02d}\b", rf"\b{h12}[:.]{m:02d}\s*[ap]\.?m", rf"\b{h12}\s*[ap]\.?m" if m == 0 else r"(?!)"]
    low = text.lower()
    near = False
    for dm in re.finditer("|".join(dates), low):
        window = low[max(0, dm.start() - 300):dm.end() + 300]
        if any(re.search(t, window) for t in times):
            if e["action"] != "cancel" or re.search(r"\bno\b|\bnot\b|cancel|replac|moved|instead|suspend", window):
                near = True
                break
    if not near:
        return False
    if e["action"] == "cancel":
        wd = (day.weekday() + 1) % 7  # myCatholicSG: 0 = Sunday
        return any(r["d"] == wd and r["t"] == e["time"] and r.get("type", "Mass") == e.get("type", "Mass") for r in mc_rules)
    return True


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    os.replace(tmp, path)


def write_site_check(recs, out_dir):
    """Human-readable monthly report: where each parish's own website disagrees with myCatholicSG."""
    fmt = lambda k: f"{k[1][:3]} {k[2]}" + (f" (weeks {k[3]})" if k[3] else "") + (f" (not weeks {k[4]})" if k[4] else "")
    lines = [f"# Parish website check, {dt.datetime.now(SGT):%-d %b %Y}", "",
             "myCatholicSG is the source of truth. This lists where a parish's own website says something different.",
             "Review these and, if the parish site is right, tell myCatholicSG / the parish office.", ""]
    agree, differ, unchecked = [], [], []
    for r in sorted(recs, key=lambda r: r["name"]):
        path = os.path.join(out_dir, f"{r['id']}.json")
        doc = None
        if r["status"] == "updated" and os.path.exists(path):
            doc = json.load(open(path))
        if not doc:
            unchecked.append(f"- {r['name']}: {r['status']}" + (f" ({'; '.join(r['warnings'])[:120]})" if r["warnings"] else ""))
            continue
        d = doc["vs_mycatholic"]
        if not d["only_on_parish_site"] and not d["only_on_mycatholic"]:
            agree.append(r["name"])
            continue
        differ.append(f"### {r['name']}\n{doc['source_urls'][0]}\n"
                      + (f"- Only on parish website: {', '.join(fmt(k) for k in d['only_on_parish_site'])}\n" if d["only_on_parish_site"] else "")
                      + (f"- Only on myCatholicSG: {', '.join(fmt(k) for k in d['only_on_mycatholic'])}\n" if d["only_on_mycatholic"] else ""))
    lines += [f"## Differences ({len(differ)})", ""] + differ + [f"## Agree ({len(agree)})", "", ", ".join(agree) or "none", "",
              f"## Not checked ({len(unchecked)})", ""] + unchecked
    with open(os.path.join(ROOT, "data", "site-check.md"), "w") as f:
        f.write("\n".join(lines) + "\n")


def slot_key(e):
    return (e["type"], e["day"], e["time"], tuple(e["weeks"]), tuple(e["except_weeks"]))


def mycatholic_keys(mc, pid):
    return {(r["type"], DAYS[r["d"]], r["t"], tuple(r["weeks"]), tuple(r["except"])) for r in mc.get("rules", {}).get(pid, [])}


def vote(results, mc_keys):
    """results: {model: validated result}. Returns merged result + list of disputes."""
    models = list(results)
    by_key = {}
    for m in models:
        for e in results[m]["regular"]:
            by_key.setdefault(slot_key(e), {})[m] = e
    regular, disputes = [], []
    for key, seen in sorted(by_key.items(), key=lambda kv: (DAYS.index(kv[0][1]), kv[0][2])):
        agree = len(seen) == len(models)
        keep = agree or key in mc_keys
        if not agree:
            disputes.append({"slot": list(key), "models": sorted(seen), "mycatholic": key in mc_keys, "kept": keep})
        if keep:
            regular.append(seen[models[0]] if models[0] in seen else next(iter(seen.values())))
    dated_sets = [{(d["type"], d["date"], d["time"], d["action"]): d for d in results[m]["dated"]} for m in models]
    dated = [dated_sets[0][k] for k in dated_sets[0] if all(k in ds for ds in dated_sets)]
    first = results[models[0]]
    return {
        "has_schedule": True,
        "regular": regular,
        "dated": dated,
        # only trust a public-holiday exception when every model read it
        "no_weekday_mass_on_public_holidays": all(r["no_weekday_mass_on_public_holidays"] for r in results.values()),
        "public_holiday_masses": sorted(set.intersection(*[set(r["public_holiday_masses"]) for r in results.values()])),
        "notes": first["notes"][:3],
        "info": clean_info(first.get("info")),
        "events": clean_events(first.get("events")),
    }, disputes


def to_rules(regular):
    return [{"d": DAYS.index(e["day"]), "t": e["time"], "weeks": e["weeks"], "except": e["except_weeks"], "type": e["type"],
             "lang": e["language"], "loc": e["location"], "note": e["note"]} for e in regular]


def mass_slots(doc):
    return {(r["d"], r["t"], tuple(r["weeks"])) for r in doc.get("rules", []) if r["type"] == "Mass"}


def run_one(pid, urls, parish, mc, args):
    out_path = os.path.join(args.out, f"{pid}.json")
    try:
        prev = json.load(open(out_path)) if os.path.exists(out_path) else None
    except ValueError:
        prev = None
    rec = {"id": int(pid), "name": parish["name"], "warnings": [], "usage": {}}
    if args.bulletin_only:
        # the weekly job: this week's bulletin (or what the parish publishes in its place) is the only text read;
        # parish websites are too unreliable to scrape. No bulletin: keep what we had (myCatholicSG + hand-curated)
        found = args.latest.get(pid)
        if not found or not found.get("url"):
            rec["status"] = "no-bulletin"
            return rec
        urls = [found["url"]]
    elif not urls:
        rec["status"] = "no-source"
        return rec
    texts, how = [], []
    for u in ([] if args.bulletin_only else urls):
        try:
            t, mode = fetch(u)
            texts.append(f"[{u}]\n{t[:30000 // len(urls)]}")
            how.append(mode)
        except Exception as e:  # noqa: BLE001 - any fetch failure just means "keep previous"
            rec["warnings"].append(f"fetch failed {u}: {type(e).__name__} {str(e)[:80]}")
    if not texts and not args.bulletin_only:
        rec["status"] = "kept-previous" if prev else "failed"
        return rec
    bulletin = None
    found = args.latest.get(pid)  # this week's, from myCatholicSG or the parish website (scripts/fetch_bulletins.py)
    if found and found.get("date") and found["date"] >= (dt.datetime.now(SGT).date() - dt.timedelta(days=21)).isoformat():
        try:
            bulletin = {"url": found["url"], "date": found["date"], "text": bulletin_text(found["url"])}
            texts.append(f"[bulletin {bulletin['url']} dated {bulletin['date']}]\n{bulletin['text'][:20000]}")
        except Exception as e:  # noqa: BLE001 - the website alone still gives the schedule
            rec["warnings"].append(f"bulletin: {type(e).__name__} {str(e)[:80]}")
    elif args.bulletins.get(pid) and not args.bulletin_only:
        try:
            bulletin = latest_bulletin(args.bulletins[pid])
            texts.append(f"[bulletin {bulletin['url']} dated {bulletin['date'] or 'unknown'}]\n{bulletin['text'][:20000]}")
        except Exception as e:  # noqa: BLE001 - the website alone still gives the schedule
            rec["warnings"].append(f"bulletin: {type(e).__name__} {str(e)[:80]}")

    if not texts:  # bulletin-only, and the bulletin couldn't be read (an image, say): keep what we had
        rec["status"] = "kept-previous" if prev else "no-bulletin"
        return rec
    results = {}
    with cf.ThreadPoolExecutor(len(args.models)) as ex:
        futs = {m: ex.submit(extract, parish["name"], urls[0], "\n\n".join(texts), m) for m in args.models}
    for m, f in futs.items():
        try:
            res, usage = f.result()
        except Exception as e:  # noqa: BLE001
            rec["warnings"].append(f"{m} failed: {type(e).__name__} {str(e)[:100]}")
            continue
        rec["usage"][m] = usage
        res, problems = validate(res)
        if not res["has_schedule"]:
            rec["warnings"].append(f"{m}: no schedule on page")
        elif problems:
            rec["warnings"].append(f"{m}: {'; '.join(problems)}")
        else:
            results[m] = res
    if len(results) < min(2, len(args.models)):
        rec["warnings"].append(f"need {min(2, len(args.models))} good model results, got {len(results)}")
        rec["status"] = "kept-previous" if prev else "failed"
        return rec

    mc_keys = mycatholic_keys(mc, pid)
    merged, disputes = vote(results, mc_keys)
    source_text = "\n\n".join(texts)
    kept = [e for e in merged["dated"] if grounded(e, source_text, mc.get("rules", {}).get(pid, []), args.holidays)]
    if len(kept) < len(merged["dated"]):
        rec["warnings"].append(f"dropped {len(merged['dated']) - len(kept)} dated item(s) the text does not state")
    merged["dated"] = kept
    site_keys = {slot_key(e) for e in merged["regular"]}
    mc_mass = {k for k in mc_keys if k[0] == "Mass"}
    site_mass = {k for k in site_keys if k[0] == "Mass"}
    diff = {"only_on_parish_site": sorted(map(list, site_mass - mc_mass)), "only_on_mycatholic": sorted(map(list, mc_mass - site_mass))}
    doc = {"id": int(pid), "name": parish["name"], "source_urls": urls,
           "fetched_at": dt.datetime.now(SGT).isoformat(timespec="minutes"), "fetch_mode": how, "models": list(results),
           "rules": to_rules(merged["regular"]), "dated": merged["dated"],
           "no_weekday_mass_on_public_holidays": merged["no_weekday_mass_on_public_holidays"],
           "public_holiday_masses": merged["public_holiday_masses"], "notes": merged["notes"], "info": merged.get("info", {}),
           "events": merged.get("events", []),
           "bulletin": {"url": bulletin["url"], "date": bulletin["date"]} if bulletin else None,
           "disputes": disputes,
           "vs_mycatholic": diff}
    rec["disputes"] = len(disputes)
    rec["vs_mycatholic"] = f"+{len(diff['only_on_parish_site'])}/-{len(diff['only_on_mycatholic'])}"
    if prev and not args.force and not args.bulletin_only:  # a bulletin's Mass list isn't compared with a website's
        a, b = mass_slots(prev), mass_slots(doc)
        changed = len(a ^ b) / max(len(a | b), 1)
        if changed > 0.5:
            rec["warnings"].append(f"{changed:.0%} of Mass slots changed; kept previous (rerun with --force to accept)")
            rec["status"] = "kept-previous"
            return rec
    write_json(out_path, doc)
    rec["status"] = "updated"
    rec["masses"] = sum(1 for r in doc["rules"] if r["type"] == "Mass")
    return rec


def main():
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated parish ids")
    ap.add_argument("--models", default=os.environ.get("OPENROUTER_MODELS", DEFAULT_MODELS),
                    help="comma-separated OpenRouter model ids that vote")
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "parishes"))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--bulletin-only", action="store_true", help="read this week's bulletin alone, no parish website")
    args = ap.parse_args()
    args.models = [m.strip() for m in args.models.split(",") if m.strip()]
    os.makedirs(args.out, exist_ok=True)
    mc_path = os.path.join(ROOT, "data", "mycatholic.json")
    mc = json.load(open(mc_path)) if os.path.exists(mc_path) else {}

    hpath = os.path.join(ROOT, "data", "holidays.json")
    args.holidays = set(json.load(open(hpath)).get("dates", {})) if os.path.exists(hpath) else set()
    bpath = os.path.join(ROOT, "data", "bulletins.json")
    args.bulletins = {k: v for k, v in json.load(open(bpath)).items() if not k.startswith("_")} if os.path.exists(bpath) else {}
    lpath = os.path.join(ROOT, "data", "bulletins_latest.json")
    args.latest = json.load(open(lpath)).get("parishes", {}) if os.path.exists(lpath) else {}
    sources = {k: v for k, v in json.load(open(os.path.join(ROOT, "data", "sources.json"))).items() if not k.startswith("_")}
    parishes = {str(p["id"]): p for p in json.load(open(os.path.join(ROOT, "scripts", "parishes_geo.json")))}
    ids = [i for i in (args.only.split(",") if args.only else sorted(sources, key=int))
           if i in parishes and (i in sources or args.bulletin_only)]

    with cf.ThreadPoolExecutor(args.workers) as ex:
        recs = list(ex.map(lambda pid: run_one(pid, sources.get(pid, []), parishes[pid], mc, args), ids))
    report_path = os.path.join(args.out, "_report.json")
    if args.only and os.path.exists(report_path):  # a partial rerun keeps the other parishes' last results
        rerun = {r["id"] for r in recs}
        recs = sorted([r for r in json.load(open(report_path))["results"] if r["id"] not in rerun] + recs, key=lambda r: r["id"])

    tokens = {}
    for r in recs:
        for m, u in r.get("usage", {}).items():
            t = tokens.setdefault(m, [0, 0])
            t[0] += u.get("prompt_tokens", 0)
            t[1] += u.get("completion_tokens", 0)
    for r in recs:
        extra = " ".join(filter(None, [f"disputes={r['disputes']}" if r.get("disputes") else "",
                                       f"vs myCatholicSG {r['vs_mycatholic']}" if r.get("vs_mycatholic") else ""]))
        print(f"{r['id']:>2} {r['name'][:40]:40} {r['status']:14} {r.get('masses', ''):>3} {extra} {'; '.join(r['warnings'])}")
    for m, (i, o) in tokens.items():
        print(f"{m}: {i} prompt + {o} completion tokens")
    write_json(report_path,
               {"ran_at": dt.datetime.now(SGT).isoformat(timespec="minutes"), "models": args.models, "results": recs})
    if args.out == os.path.join(ROOT, "data", "parishes") and not args.bulletin_only:
        write_site_check(recs, args.out)
    # a few failures are normal (sites down); they fall back to myCatholicSG. Many failures means something is broken.
    bad = sum(r["status"] in ("failed", "kept-previous") for r in recs)
    if bad > len(recs) // 4:
        print(f"{bad} parishes failed or kept previous data", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
