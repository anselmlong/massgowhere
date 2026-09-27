"""Build public/data.json from a myCatholicSG schedule export + geocoded parishes.

Usage: python3 scripts/build_data.py [path/to/allsched.json]
The schedule export is fetched by hand (see README); this script never hits the network.
"""
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/allsched.json")
PARISHES = os.path.join(ROOT, "scripts", "parishes_geo.json")
OUT = os.environ.get("OUT") or os.path.join(ROOT, "public", "data.json")

SGT = timezone(timedelta(hours=8))
MASS_TYPES = {"Mass", "Christmas", "Simbang Gabi", "New Year"}
DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
# myCatholicSG's own parish-code -> numeric id map (parishMap chunk)
CODE_TO_ID = {
    "blessedsacrament": 1, "cathedral": 2, "christtheking": 3, "divinemercy": 4, "holycross": 5,
    "holyfamily": 6, "holyspirit": 7, "holytrinity": 8, "immaculateheartofmary": 9, "ladyoflourdes": 10,
    "nativityofblessedvirgin": 11, "perpertualsuccour": 12, "queenofpeace": 13, "starofthesea": 14,
    "risenchrist": 15, "sacredheart": 16, "novena": 17, "stanne": 18, "stanthony": 19, "stbernadette": 20,
    "stfrancisassisi": 21, "stfrancisxavier": 22, "stignatius": 23, "stjosephbukittimah": 24,
    "stjosephvictoria": 25, "stmaryofangels": 26, "stmichael": 27, "ststephen": 28, "stteresa": 29,
    "stvincentdepaul": 30, "stspeterandpaul": 31, "transfiguration": 32,
}


def un(v):
    k, x = next(iter(v.items()))
    if k == "mapValue":
        return {a: un(b) for a, b in x.get("fields", {}).items()}
    if k == "arrayValue":
        return [un(y) for y in x.get("values", [])]
    return x


def to_24h(t):
    """'5:30 PM' -> '17:30'. '12:00 MN' -> '23:59' (same convention as myCatholicSG)."""
    t = t.strip().upper()
    if t == "12:00 MN":
        return "23:59"
    m = re.fullmatch(r"(\d{1,2}):(\d{2})\s*(AM|PM|NN)?", t)
    if not m:
        raise ValueError(f"unparseable time {t!r}")
    h, mi, ap = int(m[1]), int(m[2]), m[3]
    if ap == "AM" and h == 12:
        h = 0
    elif ap == "PM" and h != 12:
        h += 12
    return f"{h:02d}:{mi:02d}"


def clean(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


def lang_name(s):
    s = clean(s)
    if s.lower() in ("chinese", "mandarin/中文"):
        return "Mandarin"
    if s.lower() == "indonesian":
        return "Bahasa Indonesia"
    return s.title() if s.islower() or s.isupper() else s or "English"


def main():
    raw = json.load(open(SRC))
    parishes = {int(p["id"]): p for p in json.load(open(PARISHES))}
    today = datetime.now(SGT).date()
    CUTOFF = date.fromisoformat(os.environ["CUTOFF"]) if os.environ.get("CUTOFF") else today - timedelta(days=1)
    as_of = None
    rules, dated = {}, {}
    skipped = 0

    for doc in raw["documents"]:
        code = doc["name"].rsplit("/", 1)[1]
        pid = CODE_TO_ID[code]
        f = {k: un(v) for k, v in doc.get("fields", {}).items()}
        upd = doc.get("updateTime", "")[:10]
        as_of = max(as_of or upd, upd)
        seen = set()
        for x in f.get("schedule", []):
            # `hide` is not filtered by myCatholicSG's own frontend (Holy Family marks every regular Mass hidden)
            typ = clean(x.get("type")) or "Mass"
            if typ not in MASS_TYPES:
                continue
            base = {"t": to_24h(x["time"]), "lang": lang_name(x.get("lang")),
                    "loc": clean(x.get("location")) or "Main Church", "note": clean(x.get("notes")), "type": typ}
            a = x.get("action")
            if a == "weekly":
                ev = {"k": "w", "d": DAYS.index(x["text"].strip().lower()), **base}
            elif a == "nthweek":
                n, day = x["text"].strip().lower().split()
                ev = {"k": "n", "n": int(re.match(r"\d+", n)[0]), "d": DAYS.index(day), **base}
            elif a in ("add", "remove", "override"):
                d = datetime.strptime(clean(x["text"]), "%d %B %Y").date()
                if d < CUTOFF:
                    continue
                ev = {"k": a[0], "date": d.isoformat(), **base}
            else:
                skipped += 1
                continue
            key = json.dumps({k: v for k, v in ev.items() if k != "note"}, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            (rules if ev["k"] in "wn" else dated).setdefault(pid, []).append(ev)

    out = {
        "asOf": as_of,
        "builtAt": datetime.now(SGT).isoformat(timespec="minutes"),
        "parishes": [
            {"id": int(p["id"]), "name": p["name"], "address": p["address"], "postal": p.get("postal"),
             "lat": round(p["lat"], 6), "lng": round(p["lng"], 6), "phone": p.get("phone", ""),
             "website": p.get("website", ""), "link": p.get("link", "")}
            for p in sorted(parishes.values(), key=lambda p: p["name"])
        ],
        "rules": {str(k): v for k, v in rules.items()},
        "dated": {str(k): v for k, v in dated.items()},
    }
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    n_rules = sum(map(len, rules.values()))
    n_dated = sum(map(len, dated.values()))
    print(f"wrote {OUT}: {len(out['parishes'])} parishes, {n_rules} recurring, {n_dated} dated, "
          f"skipped {skipped}, data as of {as_of}, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
