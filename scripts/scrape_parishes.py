"""Read each parish's own website and extract its schedule with an LLM (via OpenRouter).

Usage:
  python3 scripts/scrape_parishes.py                 # all parishes -> data/parishes/<id>.json
  python3 scripts/scrape_parishes.py --only 5,6 --models a/x,b/y --out /tmp/x
  python3 scripts/scrape_parishes.py --force         # accept big changes without the safety check

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
    text = fetch_static(url)
    if len(TIME_RE.findall(text)) >= 3:
        return text, "static"
    return fetch_rendered(url), "rendered"


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
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["has_schedule", "regular", "dated", "no_weekday_mass_on_public_holidays", "public_holiday_masses", "notes"],
    "properties": {
        "has_schedule": {"type": "boolean", "description": "true only if the page states this parish's regular Mass times"},
        "regular": {"type": "array", "items": ENTRY},
        "dated": {"type": "array", "items": DATED},
        "no_weekday_mass_on_public_holidays": {"type": "boolean"},
        "public_holiday_masses": {"type": "array", "items": {"type": "string"},
                                  "description": "HH:MM times of Masses held on public holidays, if the page says so; [] otherwise"},
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
            today=dt.datetime.now(SGT).date().isoformat(), name=name, url=url, text=text[:30000])}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "parish_schedule", "strict": True, "schema": SCHEMA}},
        "provider": {"require_parameters": True},
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json",
                 "HTTP-Referer": "https://mass.anselmlong.com", "X-Title": "MassGoWhere"})
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
    if not urls:
        rec["status"] = "no-source"
        return rec
    texts, how = [], []
    for u in urls:
        try:
            t, mode = fetch(u)
            texts.append(f"[{u}]\n{t}")
            how.append(mode)
        except Exception as e:  # noqa: BLE001 - any fetch failure just means "keep previous"
            rec["warnings"].append(f"fetch failed {u}: {type(e).__name__} {str(e)[:80]}")
    if not texts:
        rec["status"] = "kept-previous" if prev else "failed"
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
    site_keys = {slot_key(e) for e in merged["regular"]}
    mc_mass = {k for k in mc_keys if k[0] == "Mass"}
    site_mass = {k for k in site_keys if k[0] == "Mass"}
    diff = {"only_on_parish_site": sorted(map(list, site_mass - mc_mass)), "only_on_mycatholic": sorted(map(list, mc_mass - site_mass))}
    doc = {"id": int(pid), "name": parish["name"], "source_urls": urls,
           "fetched_at": dt.datetime.now(SGT).isoformat(timespec="minutes"), "fetch_mode": how, "models": list(results),
           "rules": to_rules(merged["regular"]), "dated": merged["dated"],
           "no_weekday_mass_on_public_holidays": merged["no_weekday_mass_on_public_holidays"],
           "public_holiday_masses": merged["public_holiday_masses"], "notes": merged["notes"], "disputes": disputes,
           "vs_mycatholic": diff}
    rec["disputes"] = len(disputes)
    rec["vs_mycatholic"] = f"+{len(diff['only_on_parish_site'])}/-{len(diff['only_on_mycatholic'])}"
    if prev and not args.force:
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
    args = ap.parse_args()
    args.models = [m.strip() for m in args.models.split(",") if m.strip()]
    os.makedirs(args.out, exist_ok=True)
    mc_path = os.path.join(ROOT, "data", "mycatholic.json")
    mc = json.load(open(mc_path)) if os.path.exists(mc_path) else {}

    sources = {k: v for k, v in json.load(open(os.path.join(ROOT, "data", "sources.json"))).items() if not k.startswith("_")}
    parishes = {str(p["id"]): p for p in json.load(open(os.path.join(ROOT, "scripts", "parishes_geo.json")))}
    ids = [i for i in (args.only.split(",") if args.only else sorted(sources, key=int)) if i in parishes and i in sources]

    with cf.ThreadPoolExecutor(args.workers) as ex:
        recs = list(ex.map(lambda pid: run_one(pid, sources[pid], parishes[pid], mc, args), ids))

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
    write_json(os.path.join(args.out, "_report.json"),
               {"ran_at": dt.datetime.now(SGT).isoformat(timespec="minutes"), "models": args.models, "results": recs})
    if args.out == os.path.join(ROOT, "data", "parishes"):
        write_site_check(recs, args.out)
    # a few failures are normal (sites down); they fall back to myCatholicSG. Many failures means something is broken.
    bad = sum(r["status"] in ("failed", "kept-previous") for r in recs)
    if bad > len(recs) // 4:
        print(f"{bad} parishes failed or kept previous data", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
