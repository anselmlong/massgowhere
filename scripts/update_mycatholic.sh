#!/bin/sh
# Refresh the source of truth (myCatholicSG Mass schedules), rebuild, and publish.
# Run by hand, or schedule it yourself (e.g. crontab: 0 4 * * * sh ~/massgowhere/scripts/update_mycatholic.sh).
set -eu
cd "$(dirname "$0")/.."
# one job at a time, and always start from the published state (outputs are fully regenerated, so nothing is lost)
exec 9>/tmp/massgowhere.lock
flock -w 1800 9
git fetch --quiet origin main
git reset --quiet --hard origin/main
P=mycatholicsg-prod01
K=AIzaSyC6lHqLReCtzoh8LdHLJfPD9-b_ZLKi3h0
U="https://firestore.googleapis.com/v1/projects/$P/databases/(default)/documents/settings/schedule/config"
curl -sf "$U?pageSize=100&key=$K" -o data/allsched.raw.json
python3 scripts/import_mycatholic.py data/allsched.raw.json
rm -f data/allsched.raw.json
python3 scripts/build_data.py
git add data/mycatholic.json public/data.json
if git diff --cached --quiet; then echo "no changes"; exit 0; fi
git -c user.name="MassGoWhere refresh" -c user.email="refresh@mass.anselmlong.com" commit --quiet -m "data: myCatholicSG refresh $(date +%F)"
git push --quiet origin HEAD:main || { echo "push rejected; the next run starts again from origin/main" >&2; exit 1; }
echo "pushed; Vercel will deploy"
