"""Build public/data.json: parish websites first (data/parishes/<id>.json), myCatholicSG as fallback.

Usage: python3 scripts/build_data.py
Inputs:  scripts/parishes_geo.json, data/parishes/*.json, data/mycatholic.json, data/holidays.json
No network access.
"""
import json
import os
import re
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SGT = timezone(timedelta(hours=8))
MAX_AGE_DAYS = 45  # a parish-site extraction older than this falls back to myCatholicSG


def load(path, default=None):
    p = os.path.join(ROOT, path)
    return json.load(open(p)) if os.path.exists(p) else default


def main():
    parishes = load("scripts/parishes_geo.json")
    mc = load("data/mycatholic.json", {"rules": {}, "dated": {}})
    holidays = load("data/holidays.json", {"dates": {}})
    now = datetime.now(SGT)
    rules, dated, out_parishes, counts = {}, {}, [], {"parish site": 0, "myCatholicSG": 0}

    for p in sorted(parishes, key=lambda p: p["name"]):
        pid = str(p["id"])
        site = load(f"data/parishes/{pid}.json")
        fresh = site and (now - datetime.fromisoformat(site["fetched_at"])).days <= MAX_AGE_DAYS
        if fresh:
            rules[pid] = site["rules"]
            source = {"kind": "parish site", "url": site["source_urls"][0], "fetchedAt": site["fetched_at"]}
            dated[pid] = [{"k": "r" if d["action"] == "cancel" else "a", "date": d["date"], "t": d["time"], "type": d["type"],
                           "lang": d["language"] or "English", "loc": d["location"], "note": d["title"]} for d in site["dated"]]
            ph = {"noWeekday": site["no_weekday_mass_on_public_holidays"], "times": site["public_holiday_masses"]}
            # drop notes that describe the web page rather than help a visitor
            notes = [n for n in site["notes"] if not re.search(r"\b(listed|page|not (specified|stated|mentioned)|no specific)\b", n, re.I)]
        else:
            rules[pid] = mc["rules"].get(pid, [])
            source = {"kind": "myCatholicSG", "url": f"https://mycatholic.sg/parish/{p.get('link', '')}", "fetchedAt": mc.get("asOf")}
            dated[pid] = []
            ph = {"noWeekday": False, "times": []}
            notes = []
        # myCatholicSG dated entries (feasts, cancellations) apply regardless of the recurring source
        dated[pid] += mc["dated"].get(pid, [])
        counts[source["kind"]] += 1
        out_parishes.append({
            "id": int(p["id"]), "name": p["name"], "address": p["address"], "postal": p.get("postal"),
            "lat": round(p["lat"], 6), "lng": round(p["lng"], 6), "phone": p.get("phone", ""),
            "website": p.get("website", ""), "link": p.get("link", ""), "source": source, "publicHoliday": ph, "notes": notes,
        })

    out = {"builtAt": now.isoformat(timespec="minutes"), "holidays": holidays.get("dates", {}),
           "parishes": out_parishes, "rules": rules, "dated": {k: v for k, v in dated.items() if v}}
    path = os.path.join(ROOT, "public", "data.json")
    json.dump(out, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    n = sum(1 for v in rules.values() for r in v if r["type"] == "Mass")
    print(f"wrote {path}: {len(out_parishes)} parishes ({counts}), {n} weekly Mass slots, {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
