#!/usr/bin/env python3
"""Every Mass a parish bulletin mentions, as rows in one database.

Unlike scrape_parishes.py, which reads a bulletin into the site's five fields (and so drops anything that does not
fit), this asks the model for every Mass it can see — regular, public-holiday, one-off, cancelled — with the sentence
it came from. Nothing is filtered; the point is a complete record you can query.

  python3 scripts/scrape_masses.py                     # all parishes with a bulletin this week
  python3 scripts/scrape_masses.py --only 7,10         # just these
  python3 scripts/scrape_masses.py --dry-run --only 7  # print the rows, write nothing

Rows land in data/masses.db (SQLite, table `masses`). Re-running the same bulletin replaces its rows.
"""
import argparse
import json
import os
import sqlite3
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import scrape_parishes as sp  # noqa: E402  (reuse the bulletin fetch + PDF text)

DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash"

DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
        "Mon-Fri", "Weekdays", "Saturday evening", "Public holiday", "Any day", ""]
KINDS = ["regular", "public_holiday", "special", "cancelled"]

ROW = {
    "type": "object",
    "additionalProperties": False,
    "required": ["date", "day", "time", "kind", "language", "location", "note", "quote"],
    "properties": {
        "date": {"type": "string", "description": "YYYY-MM-DD for a Mass on one named date, else ''"},
        "day": {"type": "string", "enum": DAYS},
        "time": {"type": "string", "description": "24-hour HH:MM start time"},
        "kind": {"type": "string", "enum": KINDS},
        "language": {"type": "string"},
        "location": {"type": "string", "description": "e.g. 'Main Church', 'Chapel'; '' if not stated"},
        "note": {"type": "string", "description": "short qualifier, e.g. 'Sunset Mass', 'followed by Adoration'"},
        "quote": {"type": "string", "description": "the bulletin sentence this row came from, verbatim"},
    },
}
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["masses"],
          "properties": {"masses": {"type": "array", "items": ROW}}}

PROMPT = """You are reading one Catholic parish bulletin for {parish}. Bulletin for: {bulletin_date}.

List EVERY Mass this text mentions. Do not summarise and do not pick a "main" schedule — completeness is the point.
A Mass has a time. Include:
- the regular weekly timetable (each weekday, Saturday, Sunday, eve/sunset Masses), one row per weekday and time;
- Masses on public holidays, including a standing rule like "MASS ON PUBLIC HOLIDAYS: 9am (weekday or Saturday)";
- one-off Masses for a named date: feasts, novenas, funerals, first Fridays, "Monday 9 November 2026, 9:00am";
- cancelled Masses: use kind "cancelled" and the time that will NOT happen.

Rules:
- date: YYYY-MM-DD only when the text names one date. A weekday pattern leaves date "" and uses day.
- day: the weekday the row applies to; "Public holiday" for a holiday Mass with no stated weekday; "" if the text
  gives a date and no weekday.
- time: 24-hour HH:MM. "9am" -> "09:00", "12.30pm" -> "12:30", "noon" -> "12:00". Never guess a time.
- kind: regular (the standing timetable), public_holiday, special (one-off/feast), cancelled.
- language and location only as stated; "" otherwise. Where the bulletin says nothing, do not assume English.
- quote: copy the exact words from the bulletin for this row, at most 200 characters.
- If the same Mass appears twice in the text, list it once. If the text has no Mass at all, return an empty list.

Bulletin text:
<<<
{text}
>>>"""

DB = os.path.join(ROOT, "data", "masses.db")
DDL = """
CREATE TABLE IF NOT EXISTS masses (
  parish_id TEXT NOT NULL, parish TEXT NOT NULL, bulletin_date TEXT, bulletin_url TEXT,
  date TEXT, day TEXT, time TEXT, kind TEXT, language TEXT, location TEXT, note TEXT, quote TEXT,
  model TEXT, extracted_at TEXT,
  PRIMARY KEY (parish_id, bulletin_date, date, day, time, kind, location)
);
CREATE INDEX IF NOT EXISTS masses_date ON masses (date);
CREATE INDEX IF NOT EXISTS masses_parish ON masses (parish_id);
"""


def ask(parish, bulletin_date, text, model):
    body = {
        "model": model, "temperature": 0,
        "messages": [{"role": "user", "content": PROMPT.format(
            parish=parish, bulletin_date=bulletin_date or "this week", text=text[:60000])}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "masses", "strict": True, "schema": SCHEMA}},
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json",
                 "HTTP-Referer": "https://massgowhere.com", "X-Title": "massgowhere"})
    with urllib.request.urlopen(req, timeout=180) as r:
        out = json.load(r)
    choice = (out.get("choices") or [{}])[0]
    content = (choice.get("message") or {}).get("content")
    if not content:
        raise ValueError(f"model returned no content (finish_reason={choice.get('finish_reason')})")
    return json.loads(content)["masses"]


def one(pid, rec, name, model):
    try:
        text = sp.bulletin_text(rec["url"])
        try:
            rows = ask(name, rec.get("date", ""), text, model)
        except ValueError:  # an empty or unparseable answer: one more try before giving up on the parish
            rows = ask(name, rec.get("date", ""), text, model)
    except Exception as e:  # noqa: BLE001 - reported per parish, never fatal
        return pid, name, [], f"{type(e).__name__}: {e}", rec.get("date", "")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    clean = []
    for r in rows:
        t = (r.get("time") or "").strip()
        if len(t) != 5 or t[2] != ":":  # a row with no usable time is not a Mass we can show
            continue
        clean.append({**r, "time": t, "parish_id": str(pid), "parish": name, "bulletin_date": rec.get("date", ""),
                      "bulletin_url": rec["url"], "model": model, "extracted_at": now})
    return pid, name, clean, None, rec.get("date", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated parish ids")
    ap.add_argument("--models", default=os.environ.get("OPENROUTER_MODELS", DEFAULT_MODEL))
    ap.add_argument("--db", default=DB)
    ap.add_argument("--dry-run", action="store_true", help="print the rows, write nothing")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()

    bulletins = json.load(open(os.path.join(ROOT, "data", "bulletins_latest.json")))["parishes"]
    names = {str(p["id"]): p["name"] for p in json.load(open(os.path.join(ROOT, "scripts", "parishes_geo.json")))
             if isinstance(p, dict) and "id" in p}
    if a.only:
        want = {x.strip() for x in a.only.split(",")}
        bulletins = {k: v for k, v in bulletins.items() if k in want}
    model = a.models.split(",")[0]

    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        results = list(ex.map(lambda kv: one(kv[0], kv[1], names.get(str(kv[0]), f"parish {kv[0]}"), model),
                              bulletins.items()))

    total, bad = 0, []
    db = None if a.dry_run else sqlite3.connect(a.db)
    if db:
        db.executescript(DDL)
    for pid, name, rows, err, bdate in sorted(results, key=lambda r: int(r[0])):
        if err:
            bad.append((pid, name, err))
            print(f"  {pid:>3} {name[:34]:<34} FAILED  {err[:80]}")
            continue
        total += len(rows)
        if db:
            db.execute("DELETE FROM masses WHERE parish_id=? AND bulletin_date=?", (str(pid), bdate))
            db.executemany("INSERT OR REPLACE INTO masses VALUES "
                           "(:parish_id,:parish,:bulletin_date,:bulletin_url,:date,:day,:time,:kind,:language,"
                           ":location,:note,:quote,:model,:extracted_at)", rows)
            db.commit()
        kinds = {}
        for r in rows:
            kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
        print(f"  {pid:>3} {name[:34]:<34} {len(rows):>3} rows  {kinds}")
        if a.dry_run:
            for r in rows[:6]:
                print(f"        {r['date'] or r['day']:<12} {r['time']}  {r['kind']:<14} {r['language']:<8} {r['note'][:30]}")
    if db:
        db.close()
    where = "printed" if a.dry_run else f"-> {a.db}"
    print(f"\n{total} masses {where}; {len(bad)} parish(es) failed")
    return 0 if total else 1


if __name__ == "__main__":
    sys.exit(main())
