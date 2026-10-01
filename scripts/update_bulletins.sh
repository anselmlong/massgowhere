#!/bin/sh
# Daily (VPS crontab, after the myCatholicSG refresh): find each parish's newest bulletin (myCatholicSG, else the parish
# website), read each one not read yet with the parish's website (one-off Mass changes, events, parish info), rebuild,
# commit + push. A parish's bulletin is read once, the day after it is posted. Never changes Mass times.
set -eu
cd "$(dirname "$0")/.."
# one job at a time, and always start from the published state (outputs are fully regenerated, so nothing is lost)
exec 9>/tmp/massgowhere.lock
flock -w 1800 9
git fetch --quiet origin main
git reset --quiet --hard origin/main
python3 scripts/fetch_bulletins.py
NEW=$(python3 scripts/fetch_bulletins.py --unread)
if [ -n "$NEW" ]; then
  echo "reading new bulletins: $NEW"
  python3 scripts/scrape_parishes.py --only "$NEW" --workers 4 || echo "some parishes could not be read"
fi
python3 scripts/build_data.py
git add data/bulletins_latest.json data/parishes data/site-check.md public/data.json public/parish
if git diff --cached --quiet; then echo "no changes"; exit 0; fi
git -c user.name="MassGoWhere bulletins" -c user.email="refresh@massgowhere.com" commit --quiet -m "data: this week's bulletins $(date +%F)"
git push --quiet origin HEAD:main || { echo "push rejected; the next run starts again from origin/main" >&2; exit 1; }
echo "pushed"
