"""For churches without a Commons photo, read each parish website's og:image / twitter:image so a person can pick (data/parish_photo_picks.json)."""
import json, re, urllib.parse, urllib.request, concurrent.futures as cf

d = json.load(open("public/data.json"))
have = set(json.load(open("data/photo_picks.json")))
UA = {"User-Agent": "Mozilla/5.0 (massgowhere photo check; anselmpius@gmail.com)"}

def look(p):
    url = (p.get("siteCheck") or {}).get("url") or p.get("website")
    if not url: return p["id"], None, None, "no website"
    try:
        html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15).read(400000).decode("utf8", "ignore")
    except Exception as e:
        return p["id"], url, None, str(e)[:50]
    for pat in (r'<meta[^>]+property=["\']og:image["\'][^>]*content=["\']([^"\']+)', r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image', r'<meta[^>]+name=["\']twitter:image["\'][^>]*content=["\']([^"\']+)'):
        m = re.search(pat, html, re.I)
        if m: return p["id"], url, urllib.parse.urljoin(url, m.group(1).replace("&amp;", "&")), ""
    return p["id"], url, None, "no og:image"

todo = [p for p in d["parishes"] if str(p["id"]) not in have]
with cf.ThreadPoolExecutor(8) as ex:
    for pid, site, img, why in ex.map(look, todo):
        print(pid, next(p["name"] for p in todo if p["id"] == pid), "|", img or why)
