#!/bin/sh
# Refresh Mass times from myCatholicSG (read-only), rebuild data.json, and redeploy mass.anselmlong.com.
# Run by hand:  sh ~/massgowhere/refresh.sh
set -e
cd "$(dirname "$0")"

P=mycatholicsg-prod01
K=AIzaSyC6lHqLReCtzoh8LdHLJfPD9-b_ZLKi3h0
U="https://firestore.googleapis.com/v1/projects/$P/databases/(default)/documents/settings/schedule/config"
curl -sf "$U?pageSize=100&key=$K" -o ~/allsched.json

python3 scripts/build_data.py ~/allsched.json
node scripts/check.js | head -2
vercel deploy --prod --yes --scope anselms-projects-0f2defbb | tail -1
