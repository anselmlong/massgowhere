"""Download the chosen Wikimedia Commons photos (data/photo_picks.json: parish id -> file title) to public/photos/<id>.jpg
(960px wide) and write their credit lines to public/photos/credits.json. Run find_photos.py first to see candidates."""
import json, os, re, urllib.parse, urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "massgowhere-photos/1.0 (anselmpius@gmail.com)"}
def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
strip = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()

picks = json.load(open("data/photo_picks.json"))
os.makedirs("public/photos", exist_ok=True)
credits = {}
for pid, title in picks.items():
    q = {"action": "query", "format": "json", "titles": "File:" + title, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 960}
    page = next(iter(json.loads(fetch(API + "?" + urllib.parse.urlencode(q)))["query"]["pages"].values()))
    ii = page["imageinfo"][0]; m = ii["extmetadata"]
    open(f"public/photos/{pid}.jpg", "wb").write(fetch(ii["thumburl"]))
    credits[pid] = {"title": title, "author": strip(m.get("Artist", {}).get("value")) or "Unknown", "license": strip(m.get("LicenseShortName", {}).get("value")),
                    "licenseUrl": m.get("LicenseUrl", {}).get("value", ""), "page": ii["descriptionurl"]}
    print(pid, credits[pid]["license"], "|", credits[pid]["author"][:40])
json.dump(credits, open("public/photos/credits.json", "w"), indent=1, ensure_ascii=False)
