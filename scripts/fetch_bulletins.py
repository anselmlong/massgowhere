"""Each parish's newest weekly bulletin -> data/bulletins_latest.json: myCatholicSG's, else the parish website's.

Usage:
  python3 scripts/fetch_bulletins.py            # fetch and write
  python3 scripts/fetch_bulletins.py --unread   # print ids whose current bulletin the parish read has not read yet

mycatholic.sg/bulletin/<slug> reads Firestore database prod-sg (collection "bulletin", parish = our id as a string,
newest "created" first); each entry links a PDF. When a parish has none from the last FRESH_DAYS, the page named in
data/bulletins.json is searched for the bulletin itself (a PDF, a Drive file or a newsletter; needs Playwright and
pdftotext, as on the VPS). A parish whose lookup fails keeps its previous entry. No LLM here: scripts/scrape_parishes.py
reads the bulletins (scripts/update_bulletins.sh runs it for new ones).
"""
import datetime as dt
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SGT = dt.timezone(dt.timedelta(hours=8))
OUT = os.path.join(ROOT, "data", "bulletins_latest.json")
# the public web key from mycatholic.sg's own app (also in update_mycatholic.sh)
URL = ("https://firestore.googleapis.com/v1/projects/mycatholicsg-prod01/databases/prod-sg/documents:runQuery"
       "?key=AIzaSyC6lHqLReCtzoh8LdHLJfPD9-b_ZLKi3h0")
FRESH_DAYS = 21  # an older bulletin is not "the latest": the parish read skips it


def run_query(sq):
    req = urllib.request.Request(URL, json.dumps({"structuredQuery": sq}).encode(), {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def val(f):
    return next(iter(f.values()))


def newest(pid):
    rows = run_query({"from": [{"collectionId": "bulletin"}],
                      "where": {"fieldFilter": {"field": {"fieldPath": "parish"}, "op": "EQUAL", "value": {"stringValue": pid}}},
                      "orderBy": [{"field": {"fieldPath": "created"}, "direction": "DESCENDING"}], "limit": 1})
    doc = rows[0].get("document") if rows else None
    if not doc:
        return None
    f = doc["fields"]
    # only what a visitor needs; the uploader's name and id are left out
    day = dt.datetime.fromtimestamp(int(val(f["created"])) / 1000, SGT).date()
    return {"from": "myCatholicSG", "title": val(f.get("title", {"s": ""})).strip(), "date": day.isoformat(), "url": val(f["filelink"])}


def on_website(page):
    """The newest bulletin linked from a parish's bulletin page (scrape_parishes.latest_bulletin), without its text."""
    from scrape_parishes import latest_bulletin

    b = latest_bulletin(page)
    return {"from": "website", "title": "", "date": b["date"], "url": b["url"], "page": page}


def load(path, default):
    try:
        return json.load(open(path))
    except (OSError, ValueError):
        return default


def fresh(b, today=None):
    today = today or dt.datetime.now(SGT).date()
    return bool(b and b.get("date")) and (today - dt.date.fromisoformat(b["date"])).days <= FRESH_DAYS


def unread():
    """Ids with a current myCatholicSG bulletin and a website to read it with, whose last read used another bulletin."""
    cur = load(OUT, {}).get("parishes", {})
    sources = load(os.path.join(ROOT, "data", "sources.json"), {})
    out = []
    for pid, b in cur.items():
        if not fresh(b) or not sources.get(pid):
            continue
        read = (load(os.path.join(ROOT, "data", "parishes", f"{pid}.json"), {}) or {}).get("bulletin") or {}
        if read.get("url") != b["url"]:
            out.append(pid)
    return sorted(out, key=int)


def main():
    if "--unread" in sys.argv:
        print(",".join(unread()))
        return
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from import_mycatholic import CODE_TO_ID

    slug = {str(i): code for code, i in CODE_TO_ID.items()}
    prev = load(OUT, {}).get("parishes", {})
    pages = {k: v for k, v in load(os.path.join(ROOT, "data", "bulletins.json"), {}).items() if not k.startswith("_")}
    out, failed = {}, []
    for pid in sorted(slug, key=int):
        try:
            b = newest(pid)
        except Exception as e:  # noqa: BLE001 - keep the last good entry
            failed.append(f"{pid}: {type(e).__name__} {str(e)[:60]}")
            b = prev.get(pid)
        if b and b.get("from") == "myCatholicSG":
            b = {**b, "page": f"https://mycatholic.sg/bulletin/{slug[pid]}"}
        if not fresh(b) and pages.get(pid):
            try:
                w = on_website(pages[pid])
                if fresh(w) or not b:  # an older website bulletin doesn't replace myCatholicSG's
                    b = w
            except Exception as e:  # noqa: BLE001 - keep what myCatholicSG has, however old
                failed.append(f"{pid} website: {type(e).__name__} {str(e)[:60]}")
                b = b or (prev.get(pid) if (prev.get(pid) or {}).get("from") == "website" else None)
        if b:
            out[pid] = b
    if len(failed) == len(slug):
        sys.exit("every query failed: " + failed[0])
    doc = {"_comment": "Each parish's newest bulletin (scripts/fetch_bulletins.py): myCatholicSG's (date = posted, SGT), else the parish website's (date = written in the link or on its first page).",
           "fetchedAt": dt.datetime.now(SGT).isoformat(timespec="minutes"), "parishes": out}
    tmp = OUT + ".tmp"
    json.dump(doc, open(tmp, "w"), indent=1, ensure_ascii=False)
    os.replace(tmp, OUT)
    n = sum(fresh(b) for b in out.values())
    print(f"wrote {OUT}: {len(out)} parishes with a bulletin, {n} posted in the last {FRESH_DAYS} days")
    for f in failed:
        print("failed", f, file=sys.stderr)


if __name__ == "__main__":
    main()
