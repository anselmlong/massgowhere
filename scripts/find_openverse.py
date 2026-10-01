"""Candidate Creative Commons photos (Openverse) for churches still without one, for a person to pick from."""
import json, re, urllib.parse, urllib.request
d = json.load(open("public/data.json")); cr = json.load(open("public/photos/credits.json"))
for p in d["parishes"]:
    if str(p["id"]) in cr: continue
    q = f'{p["name"]} Singapore'
    u = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode({"q": q, "page_size": 5, "license_type": "commercial,modification", "category": "photograph"})
    try: r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "massgowhere/1.0"}), timeout=20))
    except Exception as e: print(p["id"], p["name"], "ERR", e); continue
    print(p["id"], p["name"])
    for x in r["results"]:
        print("   ", x["license"], x["license_version"], "|", (x["title"] or "")[:60], "|", x["source"], "|", x["url"][:90])
