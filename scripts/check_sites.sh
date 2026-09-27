#!/bin/sh
# Monthly check (systemd timer on the VPS): read every parish's own website, compare with myCatholicSG,
# write data/site-check.md, rebuild (adds "parish website agrees" flags), commit + push. Never changes Mass times.
set -eu
cd "$(dirname "$0")/.."
git pull --rebase --quiet
python3 scripts/scrape_parishes.py --workers 4 --force || echo "some parishes could not be checked"
python3 scripts/build_data.py
git add data/parishes data/site-check.md public/data.json
if git diff --cached --quiet; then echo "no changes"; exit 0; fi
git -c user.name="MassGoWhere check" -c user.email="refresh@mass.anselmlong.com" commit --quiet -m "data: monthly parish website check $(date +%F)"
git push --quiet || { git pull --rebase --quiet && git push --quiet; }
echo "pushed"
