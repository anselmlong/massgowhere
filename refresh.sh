#!/bin/sh
# Weekly refresh (runs on the VPS via a systemd timer; safe to run by hand):
#   re-read every parish website -> rebuild public/data.json -> commit + push -> Vercel deploys from GitHub.
# The myCatholicSG fallback (data/mycatholic.json) is refreshed by hand only; see README.
set -eu
cd "$(dirname "$0")"

git pull --ff-only --quiet
python3 scripts/scrape_parishes.py --workers 4 || echo "scrape reported problems; parishes that failed keep their previous data"
python3 scripts/build_data.py

git add data/parishes public/data.json
if git diff --cached --quiet; then
  echo "no schedule changes"
  exit 0
fi
git -c user.name="MassGoWhere refresh" -c user.email="refresh@mass.anselmlong.com" \
  commit --quiet -m "data: weekly parish schedule refresh $(date +%F)"
git push --quiet
echo "pushed; Vercel will deploy"
