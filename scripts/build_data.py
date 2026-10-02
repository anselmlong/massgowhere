"""Build public/data.json. Source of truth: myCatholicSG (data/mycatholic.json).

Sources, in order: myCatholicSG for Mass times; hand-curated data (data/rich/<id>.json, the reviewed read plus what
Anselm has checked by hand, and data/services.json for the Adoration/Confession finder); this week's bulletin, read
automatically each week (data/parishes/<id>.json, see scripts/update_bulletins.sh). Parish websites aren't read any more.

What goes beyond Mass times is in public/parish/<id>.json, which only the church page loads: the hand-curated read
field by field, gaps filled from the bulletin read; dated changes and events from both.

Usage: python3 scripts/build_data.py
No network access.
"""
import json
import os
import re
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


INFO_FIELDS = ("adoration", "confession", "devotions", "office_hours", "good_to_know")


def site_info(pid, website, today):
    """What the church page shows beyond myCatholicSG: the hand-curated read (data/rich) field by field, which always
    wins, with gaps filled from the automatic bulletin read. None when neither has anything.

    Dated Mass changes carry "reviewed": only reviewed cancellations may strike a Mass off the week list."""
    rich = load(f"data/rich/{pid}.json") or {}
    site = load(f"data/parishes/{pid}.json") or {}
    urls = site.get("source_urls") or []
    m_at = (site.get("fetched_at") or "")[:10] if urls else ""
    r_at = rich.get("readAt", "")
    wrap = lambda v: [{"text": x} for x in v] if isinstance(v, list) else {"text": v}
    monthly = {k: wrap(v) for k, v in ((site.get("info") or {}) if urls else {}).items() if k in INFO_FIELDS and v}
    # no regular Mass times from automatic reads: those come from myCatholicSG alone
    if urls and site.get("dated"):
        monthly["dated"] = [{"date": d["date"], "time": d["time"], "title": d["title"], "action": d["action"],
                             "language": d.get("language", ""), "location": d.get("location", "")}
                            for d in site["dated"] if d.get("type", "Mass") == "Mass"] or None
    if urls and site.get("events"):
        monthly["events"] = site["events"]
    if urls and site.get("bulletin"):
        monthly["bulletin"] = site["bulletin"]
    # regular Mass times come from myCatholicSG alone, not from the reviewed read's copy of the parish website
    rich = {k: v for k, v in rich.items() if k not in ("id", "readAt", "rules") and v}
    rich["dated"] = [{**d, "reviewed": True} for d in rich.get("dated", [])] or None
    monthly = {k: v for k, v in monthly.items() if v}
    rich = {k: v for k, v in rich.items() if v}
    first, second = rich, monthly  # hand-curated wins; the automatic read only fills gaps
    out = {**second, **first}
    # dated changes and events come from both reads: a new bulletin's must show even while the rich read is fresh.
    # The same date and time once (the preferred read's wording).
    for k in ("dated", "events"):
        seen, both = set(), []
        for x in (first.get(k) or []) + (second.get(k) or []):
            if (x["date"], x.get("time", "")) not in seen:
                seen.add((x["date"], x.get("time", "")))
                both.append(x)
        if both:
            out[k] = sorted(both, key=lambda x: (x["date"], x.get("time", "")))
    # the bulletin the last automatic read used (the weekly one), else the one the rich read saw
    if monthly.get("bulletin") or rich.get("bulletin"):
        out["bulletin"] = monthly.get("bulletin") or rich["bulletin"]
    if not out:
        return None
    # where each part came from, for the page's source notes
    out["from"] = {k: ("reviewed" if k in rich and out[k] is rich[k] else "monthly") for k in out}
    out["readAt"] = {"reviewed": r_at, "monthly": m_at}
    out["url"] = website or (urls[0] if urls else "")
    return out


# myCatholicSG notes that only announce a change ("New Timing!") tell a visitor nothing: the time is simply the time
NOISE_NOTE = re.compile(r"^\W*(new|updated|changed?)\s+(mass\s+)?(timings?|times?|schedule)\W*$", re.I)


def clean_notes(entries):
    return [{**e, "note": ""} if NOISE_NOTE.match(e.get("note") or "") else e for e in entries]


def main():
    parishes = load("scripts/parishes_geo.json")
    mc = load("data/mycatholic.json")
    holidays = load("data/holidays.json", {"dates": {}})
    # Adoration and Confession hours for the finder, hand-checked (see data/services.json and public/services.js)
    services = load("data/services.json", {"parishes": {}})
    services = {"checked": services.get("checked", ""), "parishes": services.get("parishes", {})}
    # each parish's newest bulletin, from myCatholicSG or its website (scripts/fetch_bulletins.py); the page decides
    # from its date whether it is this week's
    bulletins = load("data/bulletins_latest.json", {}).get("parishes", {})
    out_parishes, infos = [], {}
    for p in sorted(parishes, key=lambda p: p["name"]):
        pid = str(p["id"])
        out_parishes.append({
            "id": int(p["id"]), "name": p["name"], "address": p["address"], "postal": p.get("postal"),
            "lat": round(p["lat"], 6), "lng": round(p["lng"], 6), "phone": p.get("phone", ""),
            "website": p.get("website", ""), "link": p.get("link", ""),
            "source": {"kind": "myCatholicSG", "url": f"https://mycatholic.sg/parish/{p.get('link', '')}", "fetchedAt": mc["asOf"]},
            "siteCheck": None,  # parish websites aren't checked any more
            "bulletin": {k: v for k, v in bulletins[pid].items() if v} if pid in bulletins else None,
        })
        info = site_info(pid, p.get("website", ""), datetime.now(SGT).date())
        if info:
            infos[pid] = info
    out = {"builtAt": datetime.now(SGT).isoformat(timespec="minutes"), "asOf": mc["asOf"], "holidays": holidays.get("dates", {}),
           "parishes": out_parishes, "rules": {k: clean_notes(v) for k, v in mc["rules"].items()},
           "dated": {k: clean_notes(v) for k, v in mc["dated"].items() if v}, "services": services,
           # hand-checked: parishes with no weekday Mass on public holidays (data/overrides.json)
           "noWeekdayMassOnPH": load("data/overrides.json", {}).get("no_weekday_mass_on_ph", [])}
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
    # the finder only uses hand-checked hours (data/services.json): name every church whose page mentions Adoration
    # or Confession that the finder doesn't cover, so new times from a bulletin or a parish get added by hand
    names = {str(p["id"]): p["name"] for p in out_parishes}
    for pid, info in sorted(infos.items(), key=lambda x: int(x[0])):
        for kind in ("adoration", "confession"):
            spec = services["parishes"].get(pid, {}).get(kind)
            text = " ".join(x.get("text", "") for x in ([info[kind]] if isinstance(info.get(kind), dict) else info.get(kind) or []))
            if text and (not spec or spec.get("unconfirmed")):
                print(f"FINDER GAP: {names[pid]} {kind}{' (unconfirmed)' if spec else ''}: {text[:160]}")
    n = sum(1 for v in mc["rules"].values() for r in v if r["type"] == "Mass")
    print(f"wrote {path}: {len(out_parishes)} parishes, {n} weekly Mass slots (myCatholicSG as of {mc['asOf']}); "
          f"{os.path.getsize(path) // 1024} KB; parish details for {len(infos)}")


if __name__ == "__main__":
    main()
