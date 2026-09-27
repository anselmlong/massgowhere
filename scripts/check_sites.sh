#!/bin/sh
# Monthly check (systemd timer on the VPS): read every parish's own website, compare with myCatholicSG,
# write data/site-check.md, rebuild (adds "parish website agrees" flags), commit + push. Never changes Mass times.
set -eu
cd "$(dirname "$0")/.."
# one job at a time, and always start from the published state (outputs are fully regenerated, so nothing is lost)
exec 9>/tmp/massgowhere.lock
flock -w 1800 9
git fetch --quiet origin main
git reset --quiet --hard origin/main
python3 scripts/scrape_parishes.py --workers 4 --force || echo "some parishes could not be checked"
python3 scripts/build_data.py
git add data/parishes data/site-check.md public/data.json
if git diff --cached --quiet; then echo "no changes"; exit 0; fi
git -c user.name="MassGoWhere check" -c user.email="refresh@mass.anselmlong.com" commit --quiet -m "data: monthly parish website check $(date +%F)"
git push --quiet origin HEAD:main || { echo "push rejected; the next run starts again from origin/main" >&2; exit 1; }
echo "pushed"
