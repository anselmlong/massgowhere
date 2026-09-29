"""Build public/data.json. Source of truth: myCatholicSG (data/mycatholic.json).

The monthly parish-website check (data/parishes/<id>.json, see scripts/scrape_parishes.py) never changes times;
it only adds a per-parish "siteCheck" so the site can say whether the parish's own website agrees.

What each parish's website says beyond Mass times goes to public/parish/<id>.json, which only the church page loads:
the Sept 2026 rich read (data/rich/<id>.json, see scripts/import_rich.py) field by field, gaps filled from the monthly read.

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


def mass_keys(rules):
    return {(r["d"], r["t"], tuple(r.get("weeks") or []), tuple(r.get("except") or [])) for r in rules if r.get("type", "Mass") == "Mass"}


def site_check(pid, mc_rules):
    """Compare the parish website's Mass slots (last monthly check) with today's myCatholicSG data."""
    site = load(f"data/parishes/{pid}.json")
    urls = (site or {}).get("source_urls") or []
    if not site or not urls or "rules" not in site:
        return None
    return {"url": urls[0], "checkedAt": site["fetched_at"], "agrees": mass_keys(site["rules"]) == mass_keys(mc_rules)}


INFO_FIELDS = ("adoration", "confession", "devotions", "office_hours", "good_to_know")


def site_info(pid, website):
    """Everything the parish's own website says beyond Mass times, for the church page. The rich read (hand-reviewed,
    with sources) wins field by field; the monthly LLM read fills what it lacks. None when neither has anything."""
    rich = load(f"data/rich/{pid}.json") or {}
    site = load(f"data/parishes/{pid}.json") or {}
    urls = site.get("source_urls") or []
    monthly = site.get("info") if urls else None
    out = {k: v for k, v in rich.items() if k not in ("id", "readAt")}
    for k in INFO_FIELDS:
        v = (monthly or {}).get(k)
        if k not in out and v:
            out[k] = [{"text": x} for x in v] if isinstance(v, list) else {"text": v}
    if not out:
        return None
    # when it was read and where to check it: the monthly read if it filled anything, else the rich read
    used_monthly = any(k not in rich and (monthly or {}).get(k) for k in INFO_FIELDS)
    out["readAt"] = site["fetched_at"][:10] if used_monthly else rich.get("readAt", "")
    out["url"] = website or (urls[0] if urls else "")
    return out


def main():
    parishes = load("scripts/parishes_geo.json")
    mc = load("data/mycatholic.json")
    holidays = load("data/holidays.json", {"dates": {}})
    out_parishes, infos = [], {}
    for p in sorted(parishes, key=lambda p: p["name"]):
        pid = str(p["id"])
        out_parishes.append({
            "id": int(p["id"]), "name": p["name"], "address": p["address"], "postal": p.get("postal"),
            "lat": round(p["lat"], 6), "lng": round(p["lng"], 6), "phone": p.get("phone", ""),
            "website": p.get("website", ""), "link": p.get("link", ""),
            "source": {"kind": "myCatholicSG", "url": f"https://mycatholic.sg/parish/{p.get('link', '')}", "fetchedAt": mc["asOf"]},
            "siteCheck": site_check(pid, mc["rules"].get(pid, [])),
        })
        info = site_info(pid, p.get("website", ""))
        if info:
            infos[pid] = info
    out = {"builtAt": datetime.now(SGT).isoformat(timespec="minutes"), "asOf": mc["asOf"], "holidays": holidays.get("dates", {}),
           "parishes": out_parishes, "rules": mc["rules"], "dated": {k: v for k, v in mc["dated"].items() if v}}
    path = os.path.join(ROOT, "public", "data.json")
    tmp = path + ".tmp"
    json.dump(out, open(tmp, "w"), ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)
    # one small file per church, so the list and the answer don't carry every parish's details
    pdir = os.path.join(ROOT, "public", "parish")
    os.makedirs(pdir, exist_ok=True)
    for f in os.listdir(pdir):
        if f.endswith(".json") and f[:-5] not in infos:
            os.remove(os.path.join(pdir, f))
    for pid, info in infos.items():
        json.dump(info, open(os.path.join(pdir, f"{pid}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    last_holiday = max(holidays.get("dates", {}) or ["0000"])
    if last_holiday < (datetime.now(SGT) + timedelta(days=60)).date().isoformat():
        print(f"WARNING: public holidays end {last_holiday}; add next year's MOM list to data/holidays.json")
    n = sum(1 for v in mc["rules"].values() for r in v if r["type"] == "Mass")
    agree = sum(1 for p in out_parishes if p["siteCheck"] and p["siteCheck"]["agrees"])
    checked = sum(1 for p in out_parishes if p["siteCheck"])
    print(f"wrote {path}: {len(out_parishes)} parishes, {n} weekly Mass slots (myCatholicSG as of {mc['asOf']}); "
          f"parish websites agree for {agree}/{checked} checked; {os.path.getsize(path) // 1024} KB; parish details for {len(infos)}")


if __name__ == "__main__":
    main()
