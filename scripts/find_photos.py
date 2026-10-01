"""List candidate Wikimedia Commons photos for each parish, for a person to pick from (data/photos.json).
Nothing is chosen automatically: a search by name can return the wrong church."""
import json, re, urllib.parse, urllib.request

API = "https://commons.wikimedia.org/w/api.php"
def get(params):
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode({**params, "format": "json"}), headers={"User-Agent": "massgowhere-photos/1.0 (anselmpius@gmail.com)"})
    return json.load(urllib.request.urlopen(req, timeout=20))

d = json.load(open("public/data.json"))
for p in d["parishes"]:
    name = re.sub(r"\s*\(.*\)", "", p["name"]).replace("Church of ", "").replace(" Church", "")
    q = f'{p["name"]} Singapore filetype:bitmap'
    r = get({"action": "query", "generator": "search", "gsrnamespace": 6, "gsrsearch": q, "gsrlimit": 5, "prop": "imageinfo", "iiprop": "url|size"})
    pages = sorted((r.get("query", {}).get("pages", {})).values(), key=lambda x: x["index"])
    print(p["id"], p["name"])
    for x in pages:
        ii = x["imageinfo"][0]
        print("   ", x["title"][5:90], ii["width"], "x", ii["height"])
