"""Survey parish websites: find the Mass-times page and check whether times are in the static HTML."""
import json, re, urllib.request, urllib.parse, ssl, concurrent.futures as cf, os

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36"}
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
TIME = re.compile(r"\b(1[0-2]|0?[1-9])[:.][0-5]\d\s*(am|pm|a\.m\.|p\.m\.)", re.I)

def get(url):
    r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20, context=ctx)
    return r.geturl(), r.read().decode("utf-8", "replace")

def text(html):
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))

def survey(p):
    site = p.get("website") or ""
    if not site:
        return p["id"], p["name"], "NO SITE", "", 0
    try:
        final, html = get(site)
    except Exception as e:
        return p["id"], p["name"], f"ERR {type(e).__name__}", site, 0
    links = re.findall(r'href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', html, re.I | re.S)
    cands = []
    for href, label in links:
        lab = text(label).lower()
        if re.search(r"mass|schedule|worship|liturg", href.lower() + " " + lab) and not re.search(r"intention|live|stream|youtube|facebook", href.lower()):
            cands.append(urllib.parse.urljoin(final, href))
    best, best_n = final, len(TIME.findall(text(html)))
    for u in dict.fromkeys(cands):
        try:
            _, h = get(u)
        except Exception:
            continue
        n = len(TIME.findall(text(h)))
        if n > best_n:
            best, best_n = u, n
            open(f"scripts/cache/{p['id']}.html", "w").write(h)
    return p["id"], p["name"], "ok", best, best_n

ps = json.load(open("scripts/parishes_geo.json"))
with cf.ThreadPoolExecutor(8) as ex:
    for r in sorted(ex.map(survey, ps), key=lambda r: int(r[0])):
        print(f"{r[0]:>2} {r[1][:40]:40} {r[2]:10} times={r[4]:<3} {r[3]}")
