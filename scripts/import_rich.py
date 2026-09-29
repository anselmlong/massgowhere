"""Import the one-off rich parish-website read (Sept 2026, ~/massgowhere-rich on the VPS) into data/rich/<id>.json.

That read reviewed each parish's website, bulletins and posters by hand-checked browser capture. This keeps only what a
visitor would use (Adoration, Confession, devotions, office and church hours, public-holiday Masses, dated Mass changes,
events, getting there, sacraments, ministries, contacts, livestream, bulletin). It drops the Mass rules (myCatholicSG stays
the source of truth), the reviewer notes, and links to the read's local evidence files, which are not published.

Usage: python3 scripts/import_rich.py [path to massgowhere-rich]   (default ~/massgowhere-rich)
No network access. build_data.py reads data/rich/ and writes public/parish/<id>.json for the church page.
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def url(src):
    return src if isinstance(src, str) and src.startswith(("http://", "https://")) else ""


SPACE = re.compile(r"(?<![\w@.#])([A-Za-z]*[a-z]{2})(\d)")


def spaced(s):
    """The read's prose lost the space before numbers ("Adoration2 October2026 at19:30"). Put it back, leaving links,
    emails and codes like EW20 or B1 alone."""
    if not isinstance(s, str):
        return s
    return " ".join(w if re.search(r"https?:|www\.|@|\.[a-z]{2,}/", w) else SPACE.sub(r"\1 \2", w) for w in s.split(" "))


def item(o, *keys):
    """{text, ..., url} with the source kept only when it is a public link; None when there is no text."""
    if not o or not (o.get("text") or o.get("title")):
        return None
    out = {k: o[k] if k in ("date", "time", "action") else spaced(o[k]) for k in keys if o.get(k)}
    if url(o.get("source")):
        out["url"] = o["source"]
    return out


def items(lst, *keys):
    return [x for x in (item(o, *keys) for o in lst or []) if x]


def trim(d):
    info, extra, mass = d.get("info") or {}, d.get("extra") or {}, d.get("mass") or {}
    c = extra.get("contacts") or {}
    live = extra.get("livestream") or {}
    bull = extra.get("bulletin") or {}
    out = {
        "id": d["id"],
        "readAt": (d.get("scraped_at") or "")[:10],
        "adoration": item(info.get("adoration"), "text"),
        "confession": item(info.get("confession"), "text"),
        "devotions": items(info.get("devotions"), "text"),
        "office_hours": item(info.get("office_hours"), "text"),
        "good_to_know": items(info.get("good_to_know"), "text"),
        "church_hours": item(extra.get("church_opening_hours"), "text"),
        "public_holidays": item(mass.get("public_holidays"), "text"),
        "dated": items(mass.get("dated"), "date", "time", "title", "action", "language", "location"),
        "events": items(extra.get("upcoming_events"), "date", "time", "title", "text"),
        "getting_there": items(extra.get("parking_and_access"), "text"),
        "accessibility": items(extra.get("accessibility"), "text"),
        "languages": items(extra.get("languages_offered"), "text"),
        "sacraments": items(extra.get("sacraments_how_to"), "topic", "text", "contact"),
        "ministries": [x for x in (item({**o, "text": o.get("text") or o.get("name")}, "name", "text") for o in extra.get("ministries_and_groups") or []) if x],
        "other": items(extra.get("other"), "text"),
        "contacts": {k: c[k] for k in ("phone", "email", "whatsapp") if c.get(k)},
        "social": [{"platform": s.get("platform") or "Link", "url": s["url"]} for s in extra.get("social") or [] if url(s.get("url"))],
        "livestream": {"text": live.get("text", ""), "url": url(live.get("url"))} if live.get("text") or url(live.get("url")) else None,
        "bulletin": {"date": bull.get("date", ""), "url": bull["source"]} if url(bull.get("source")) else None,
    }
    return {k: v for k, v in out.items() if v}


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/massgowhere-rich")
    geo = {int(p["id"]): p["name"] for p in json.load(open(os.path.join(ROOT, "scripts", "parishes_geo.json")))}
    dest = os.path.join(ROOT, "data", "rich")
    os.makedirs(dest, exist_ok=True)
    n = 0
    for f in glob.glob(os.path.join(src, "*", "parish.json")):
        d = json.load(open(f))
        if geo.get(d["id"]) != d["name"]:
            sys.exit(f"{f}: id {d['id']} is {geo.get(d['id'])!r} here, {d['name']!r} there")
        out = trim(d)
        path = os.path.join(dest, f"{d['id']}.json")
        if len(out) <= 2:  # nothing beyond id and readAt (blocked, or no website)
            if os.path.exists(path):
                os.remove(path)
            continue
        json.dump(out, open(path, "w"), ensure_ascii=False, indent=1)
        n += 1
    print(f"wrote {n} parishes to {dest}")


if __name__ == "__main__":
    main()
