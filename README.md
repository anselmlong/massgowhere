# MassGoWhere — mass.anselmlong.com

Static site: map of Singapore's 32 Catholic parishes, nearest church, next Mass (sorted by time or distance), travel estimates, Google Maps directions.

- `public/` — the site (Leaflet + OneMap tiles, no build step). `schedule.js` expands weekly / nth-week rules and dated add/remove/override entries in fixed SGT, mirroring myCatholicSG's own logic.
- `scripts/parishes_geo.json` — parish names/addresses (myCatholicSG) geocoded with OneMap.
- `scripts/build_data.py` — turns a myCatholicSG schedule export into `public/data.json` (Mass-type entries only).
- `scripts/check.js` — sanity checks: unmatched cancellations, next Masses, spot checks.

## Refreshing Mass times

`sh refresh.sh` — fetches the schedule export, rebuilds, checks, deploys to Vercel (team `anselms-projects-0f2defbb`, project `massgowhere`).

Travel times are straight-line × 1.3 heuristics, labelled as estimates; Google Maps links give live directions.
