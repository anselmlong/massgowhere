"""For churches without a photo yet, download myCatholicSG's own photo of the church (orgs.orgImageUrl, prod-sg) to
public/photos/<id>.jpg plus a 144px square thumbnail, and add its credit to public/photos/credits.json.
Licensed Commons photos (fetch_photos.py) and ones already chosen are kept. Needs macOS (sips) for the resizing.

Usage: python3 scripts/fetch_mycatholic_photos.py [--replace 9,10]   # --replace: these ids too
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_bulletins import run_query, val  # noqa: E402
from import_mycatholic import CODE_TO_ID  # noqa: E402

PHOTOS = os.path.join(ROOT, "public", "photos")
slug = {str(i): code for code, i in CODE_TO_ID.items()}
credits_path = os.path.join(PHOTOS, "credits.json")
credits = json.load(open(credits_path))
replace = set(sys.argv[sys.argv.index("--replace") + 1].split(",")) if "--replace" in sys.argv else set()

for row in run_query({"from": [{"collectionId": "orgs"}], "limit": 1000}):
    f = (row.get("document") or {}).get("fields", {})
    pid = val(f["id"]) if "id" in f else None
    if pid not in slug or "orgImageUrl" not in f or (pid in credits and pid not in replace):
        continue
    data = urllib.request.urlopen(val(f["orgImageUrl"]), timeout=40).read()
    with tempfile.NamedTemporaryFile() as tmp:
        tmp.write(data)
        tmp.flush()
        full, thumb = os.path.join(PHOTOS, f"{pid}.jpg"), os.path.join(PHOTOS, "thumb", f"{pid}.jpg")
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "85", tmp.name, "--out", full], check=True, capture_output=True)
        w, h = (int(x.split()[-1]) for x in subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", full],
                                                            capture_output=True, text=True).stdout.strip().splitlines()[1:])
        side = min(w, h)
        subprocess.run(["sips", "-s", "format", "jpeg", "--cropToHeightWidth", str(side), str(side), full, "--out", thumb],
                       check=True, capture_output=True)
        subprocess.run(["sips", "-Z", "144", thumb], check=True, capture_output=True)  # after the crop: sips resizes first
    credits[pid] = {"author": val(f["orgName"]), "via": "myCatholicSG", "page": f"https://mycatholic.sg/parish/{slug[pid]}"}
    print(pid, val(f["orgName"]), f"{w}x{h}")
credits = {k: credits[k] for k in sorted(credits, key=int)}
json.dump(credits, open(credits_path, "w"), indent=1, ensure_ascii=False)
