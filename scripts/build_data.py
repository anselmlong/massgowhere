"""Build public/data.json. Source of truth: myCatholicSG (data/mycatholic.json).

The monthly parish-website check (data/parishes/<id>.json, see scripts/scrape_parishes.py) never changes times;
it only adds a per-parish "siteCheck" so the site can say whether the parish's own website agrees.

Usage: python3 scripts/build_data.py
No network access.
"""
import json
import os
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SGT = timezone(timedelta(hours=8))


def load(path, default=None):
    p = os.path.join(ROOT, path)
    if not os.path.exists(p):
        return default
    try:
        return json.load(open(p))
    except ValueError:
        return default


def site_check(pid):
    site = load(f"data/parishes/{pid}.json")
    if not site or "vs_mycatholic" not in site:
        return None
    diff = site["vs_mycatholic"]
    return {"url": site["source_urls"][0], "checkedAt": site["fetched_at"],
            "agrees": not diff["only_on_parish_site"] and not diff["only_on_mycatholic"]}


def main():
    parishes = load("scripts/parishes_geo.json")
    mc = load("data/mycatholic.json")
    holidays = load("data/holidays.json", {"dates": {}})
    out_parishes = []
    for p in sorted(parishes, key=lambda p: p["name"]):
        pid = str(p["id"])
        out_parishes.append({
            "id": int(p["id"]), "name": p["name"], "address": p["address"], "postal": p.get("postal"),
            "lat": round(p["lat"], 6), "lng": round(p["lng"], 6), "phone": p.get("phone", ""),
            "website": p.get("website", ""), "link": p.get("link", ""),
            "source": {"kind": "myCatholicSG", "url": f"https://mycatholic.sg/parish/{p.get('link', '')}", "fetchedAt": mc["asOf"]},
            "siteCheck": site_check(pid),
        })
    out = {"builtAt": datetime.now(SGT).isoformat(timespec="minutes"), "asOf": mc["asOf"], "holidays": holidays.get("dates", {}),
           "parishes": out_parishes, "rules": mc["rules"], "dated": {k: v for k, v in mc["dated"].items() if v}}
    path = os.path.join(ROOT, "public", "data.json")
    tmp = path + ".tmp"
    json.dump(out, open(tmp, "w"), ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)
    n = sum(1 for v in mc["rules"].values() for r in v if r["type"] == "Mass")
    agree = sum(1 for p in out_parishes if p["siteCheck"] and p["siteCheck"]["agrees"])
    checked = sum(1 for p in out_parishes if p["siteCheck"])
    print(f"wrote {path}: {len(out_parishes)} parishes, {n} weekly Mass slots (myCatholicSG as of {mc['asOf']}); "
          f"parish websites agree for {agree}/{checked} checked; {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
