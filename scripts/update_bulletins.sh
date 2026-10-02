#!/bin/sh
# Weekly, Saturday 9pm SGT, after most parishes upload the weekend's bulletin (VPS crontab): find each parish's newest
# bulletin (myCatholicSG, else what the parish publishes in its place: a PDF on its site, an emailed newsletter), read
# each one not read yet (the bulletin alone, no parish website: one-off Mass changes, events, parish info), rebuild,
# commit + push. Each bulletin is read once. Never changes Mass times. No bulletin: myCatholicSG + hand-curated data.
set -eu
cd "$(dirname "$0")/.."
# one job at a time, and always start from the published state (outputs are fully regenerated, so nothing is lost)
exec 9>/tmp/massgowhere.lock
flock -w 1800 9
git fetch --quiet origin main
git reset --quiet --hard origin/main
# run the version just fetched: the shell is still reading the file it started with, so a script changed on main
# would otherwise run its old code once (that's how a July copy of myCatholicSG got published on 2 Oct)
if [ -z "${MGW_FRESH:-}" ]; then MGW_FRESH=1 exec sh "$0" "$@"; fi
python3 scripts/fetch_bulletins.py
NEW=$(python3 scripts/fetch_bulletins.py --unread)
if [ -n "$NEW" ]; then
  echo "reading new bulletins: $NEW"
  python3 scripts/scrape_parishes.py --bulletin-only --only "$NEW" --workers 4 || echo "some bulletins could not be read"
fi
python3 scripts/build_data.py
git add data/bulletins_latest.json data/parishes public/data.json public/parish
if git diff --cached --quiet; then echo "no changes"; exit 0; fi
git -c user.name="MassGoWhere bulletins" -c user.email="refresh@massgowhere.com" commit --quiet -m "data: this week's bulletins $(date +%F)"
git push --quiet origin HEAD:main || { echo "push rejected; the next run starts again from origin/main" >&2; exit 1; }
echo "pushed"
