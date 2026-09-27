"""Convert a myCatholicSG schedule export into data/mycatholic.json (fallback + tie-break source).

Usage: python3 scripts/import_mycatholic.py [path/to/allsched.json]
The export is fetched by hand (see README); this script never hits the network.
"""
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/allsched.json")
OUT = os.environ.get("OUT") or os.path.join(ROOT, "data", "mycatholic.json")

SGT = timezone(timedelta(hours=8))
# myCatholicSG types -> our event types (Mass, Confession, Adoration, Devotion, Other)
TYPE_MAP = {"Mass": "Mass", "Christmas": "Mass", "Simbang Gabi": "Mass", "New Year": "Mass",
            "Confession": "Confession", "Penitential": "Confession", "Adoration": "Adoration", "Holy Hour": "Adoration",
            "Devotion": "Devotion", "Stations of the Cross": "Devotion"}
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
    today = datetime.now(SGT).date()
    cutoff = date.fromisoformat(os.environ["CUTOFF"]) if os.environ.get("CUTOFF") else today - timedelta(days=1)
    as_of = None
    rules, dated = {}, {}

    for doc in raw["documents"]:
        code = doc["name"].rsplit("/", 1)[1]
        pid = CODE_TO_ID[code]
        f = {k: un(v) for k, v in doc.get("fields", {}).items()}
        upd = doc.get("updateTime", "")[:10]
        as_of = max(as_of or upd, upd)
        seen = set()
        for x in f.get("schedule", []):
            # `hide` is not filtered by myCatholicSG's own frontend (Holy Family marks every regular Mass hidden)
            raw_type = clean(x.get("type")) or "Mass"
            typ = TYPE_MAP.get(raw_type, "Other")
            note = clean(x.get("notes"))
            if raw_type not in TYPE_MAP or (typ == "Mass" and raw_type != "Mass"):
                note = " · ".join(filter(None, [raw_type, note]))
            base = {"type": typ, "t": to_24h(x["time"]), "lang": lang_name(x.get("lang")),
                    "loc": clean(x.get("location")) or "Main Church", "note": note}
            a = x.get("action")
            if a == "weekly":
                ev = {"d": DAYS.index(x["text"].strip().lower()), "weeks": [], "except": [], **base}
            elif a == "nthweek":
                n, day = x["text"].strip().lower().split()
                ev = {"d": DAYS.index(day), "weeks": [int(re.match(r"\d+", n)[0])], "except": [], **base}
            elif a in ("add", "remove", "override"):
                d = datetime.strptime(clean(x["text"]), "%d %B %Y").date()
                if d < cutoff:
                    continue
                ev = {"k": a[0], "date": d.isoformat(), **base}
            else:
                continue
            key = json.dumps({k: v for k, v in ev.items() if k != "note"}, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            (dated if "date" in ev else rules).setdefault(str(pid), []).append(ev)

    # myCatholicSG often stores "every Monday" as five nth-week entries; fold those back into one weekly rule
    for pid, lst in rules.items():
        groups = {}
        for r in lst:
            groups.setdefault((r["d"], r["t"], r["type"], r["lang"], r["loc"]), []).append(r)
        folded = []
        for g in groups.values():
            weeks = {w for r in g for w in r["weeks"]}
            if any(not r["weeks"] for r in g) or {1, 2, 3, 4, 5} <= weeks:
                folded.append({**g[0], "weeks": [], "except": []})
            else:
                folded.extend(g)
        rules[pid] = folded

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"asOf": as_of, "rules": rules, "dated": dated}, open(OUT, "w"), ensure_ascii=False, indent=0)
    print(f"wrote {OUT}: {sum(map(len, rules.values()))} recurring, {sum(map(len, dated.values()))} dated, as of {as_of}")


if __name__ == "__main__":
    main()
