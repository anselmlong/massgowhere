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
# run the version just fetched: the shell is still reading the file it started with, so a script changed on main
# would otherwise run its old code once (that's how a July copy of myCatholicSG got published on 2 Oct)
if [ -z "${MGW_FRESH:-}" ]; then MGW_FRESH=1 exec sh "$0" "$@"; fi
P=mycatholicsg-prod01
K=AIzaSyC6lHqLReCtzoh8LdHLJfPD9-b_ZLKi3h0
# the live site reads the prod-sg database; (default) is an old copy that stopped updating in July 2026
U="https://firestore.googleapis.com/v1/projects/$P/databases/prod-sg/documents/settings/schedule/config"
curl -sf "$U?pageSize=100&key=$K" -o data/allsched.raw.json
python3 scripts/import_mycatholic.py data/allsched.raw.json
rm -f data/allsched.raw.json
# never publish older data than what's live: asOf is the newest update time in the database read
python3 - <<'PY'
import datetime, json, subprocess, sys
new = json.load(open("data/mycatholic.json"))["asOf"]
old = json.loads(subprocess.run(["git", "show", "HEAD:data/mycatholic.json"], capture_output=True, text=True).stdout or "{}").get("asOf", "")
if old and new < old:
    sys.exit(f"refusing to publish: myCatholicSG data as of {new} is older than what's live ({old}). Wrong database?")
if (datetime.date.today() - datetime.date.fromisoformat(new)).days > 30:
    print(f"WARNING: no parish has changed on myCatholicSG since {new}; is this still the database the site reads?", file=sys.stderr)
PY
python3 scripts/build_data.py
git add data/mycatholic.json public/data.json public/parish
if git diff --cached --quiet; then echo "no changes"; exit 0; fi
git -c user.name="MassGoWhere refresh" -c user.email="refresh@massgowhere.com" commit --quiet -m "data: myCatholicSG refresh $(date +%F)"
git push --quiet origin HEAD:main || { echo "push rejected; the next run starts again from origin/main" >&2; exit 1; }
echo "pushed; Vercel will deploy"
