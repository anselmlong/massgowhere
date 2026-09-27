"""Geocode parishes via OneMap. Tries church name first, then street address."""
import json, time, urllib.request, urllib.parse, urllib.error, sys

RAW = "/private/tmp/claude-501/-Users-anselm/a1b46c76-af4d-4446-9f12-99af344aa5cc/scratchpad/mc/orgs.json"


def un(v):
    k, x = next(iter(v.items()))
    if k == "mapValue":
        return {a: un(b) for a, b in x.get("fields", {}).items()}
    if k == "arrayValue":
        return [un(y) for y in x.get("values", [])]
    return x


def search(q):
    u = ("https://www.onemap.gov.sg/api/common/elastic/search?searchVal="
         + urllib.parse.quote(q) + "&returnGeom=Y&getAddrDetails=Y&pageNum=1")
    for wait in (2, 5, 10, 20):
        try:
            return json.load(urllib.request.urlopen(u, timeout=15)).get("results", [])
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(wait)
    return []


ps = []
for doc in json.load(open(RAW))["documents"]:
    f = {k: un(v) for k, v in doc["fields"].items()}
    if f.get("isParish") is True:
        ps.append({"id": str(f.get("id")), "name": f.get("orgName"), "address": f.get("address", ""),
                   "link": f.get("orgLink"), "phone": f.get("orgTel1", ""), "website": f.get("orgWebsite", "")})

for p in sorted(ps, key=lambda p: int(p["id"])):
    hit = None
    for q in (p["name"], p["address"]):
        res = search(q)
        time.sleep(1.2)
        if res:
            hit, via = res[0], q
            break
    if hit:
        p.update(lat=float(hit["LATITUDE"]), lng=float(hit["LONGITUDE"]), postal=hit.get("POSTAL"),
                 geo_match=f'{hit.get("BUILDING")} / {hit.get("ADDRESS")}', geo_via="name" if via == p["name"] else "address")
    print(p["id"], p["name"], "|", p["address"], "=>", p.get("geo_via"), p.get("geo_match"), flush=True)

json.dump(sorted(ps, key=lambda p: int(p["id"])), open("scripts/parishes_geo.json", "w"), indent=1)
