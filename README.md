# MassGoWhere

Find a Catholic Mass in Singapore you can actually make: from where you are, by bus/MRT, car or on foot, and when to leave.

- Website: https://mass.anselmlong.com (Vercel project `massgowhere`, auto-deploys on every push to `main`)
- Telegram bot: runs on the VPS (`systemctl --user status massgowhere-bot`)
- Product brief: [PRODUCT.md](PRODUCT.md)

## How it works

```
myCatholicSG schedules ──(scripts/update_mycatholic.sh)──> data/mycatholic.json ─┐   source of truth
parish websites ──(monthly, DeepSeek via OpenRouter)──> data/parishes/<id>.json ─┼─> scripts/build_data.py ─> public/data.json
MOM public holidays ──> data/holidays.json ──────────────────────────────────────┘
public/data.json + OneMap routing ──> api/next.js (public/rank.js) ──> website + Telegram bot
```

- **Times come from myCatholicSG.** `scripts/import_mycatholic.py` turns its export into weekly / nth-week / last-week rules plus dated additions and cancellations.
- **Monthly parish-website check.** `scripts/scrape_parishes.py` reads each parish's own page (`data/sources.json`) with an LLM and compares it with myCatholicSG. It never changes times. The build marks each parish "parish website agrees" or "lists different times", and `data/site-check.md` lists every difference for review.
- **Ranking** (`public/rank.js`, shared by browser and API): a Mass is reachable if now + travel ≤ start (trip ≤ 75 min; leave-by gets you there as Mass starts). In bus & MRT mode a church within a 10-minute walk, or a 15-minute walk that is no slower than the bus, is a walk. Take the earliest reachable start S. Among Masses starting within 90 minutes of S, pick the **shortest trip**; the earlier start breaks ties. Travel comes from OneMap routing at the time you would leave, in two passes (nearest + soonest, then anything else inside the window), falling back to a distance estimate.
- **API**: `GET /api/next?lat=1.3151&lng=103.7652&mode=transit|drive|walk[&at=<epoch ms>]` (`at` plans a departure up to 7 days ahead; omitted means now) returns `best`, `alternatives`, `nearest`, `specialDay`, `dataAsOf`. Bots call this so every surface gives the same answer.
- Public holidays, Christmas and the Triduum are not modelled as schedule changes. The site and bot show a "times may differ that day, check with the parish" notice instead.

## Run locally

```sh
cp -n .env.example .env         # -n: never overwrite an existing .env
node scripts/dev.js             # http://localhost:8787 (site + /api/next; reads .env literally)
node --test test/*.test.js      # schedule + ranking tests
python3 bot/bot.py              # Telegram bot (uses the live API; MASSGOWHERE_API overrides)
```

Add `?preview=1` to the site URL to get the colour palette switcher (Seasonal / Green / Marian blue / Violet / Red). The choice is remembered per browser.

## Refreshing data

| What | How | Where |
|---|---|---|
| myCatholicSG times (source of truth) | `sh scripts/update_mycatholic.sh`: fetch, import, build, commit, push | Run it yourself. To automate it, add the cron line below yourself on the VPS. |
| Parish website check | `sh scripts/check_sites.sh`, monthly | VPS timer `massgowhere-check.timer`, 1st of each month, 03:00 SGT |
| Public holidays | edit `data/holidays.json` when MOM publishes next year's list | The build warns when fewer than 60 days remain |

Both scripts start from `origin/main` (`git reset --hard`), take a lock (`flock`, Linux), and only commit regenerated files.

Daily myCatholicSG refresh (install by hand on the VPS if you want it automatic):

```sh
(crontab -l 2>/dev/null; echo "0 4 * * * sh /home/ubuntu/massgowhere/scripts/update_mycatholic.sh >> /home/ubuntu/massgowhere/update.log 2>&1") | crontab -
```

## Environment

`.env` on the Mac (`~/src/massgowhere/.env`) and the VPS (`~/massgowhere/.env`) holds `OPENROUTER_API_KEY`, `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` and `TELEGRAM_BOT_TOKEN`; `OPENROUTER_MODELS` is optional. Vercel needs `ONEMAP_EMAIL` and `ONEMAP_PASSWORD`, which are set for production and preview.

## VPS services

```sh
systemctl --user status massgowhere-bot
systemctl --user list-timers massgowhere-check.timer
journalctl --user -u massgowhere-check -n 50
```

## Open items

- Gospel bot (catholic-bot): a **⛪ Nearest Mass** button calls `/api/next` (bus & MRT, leaving now) and points to @massgowherebot for more.
- Events board (vigils, feasts, devotions): the data model already keeps Confession, Adoration and Devotion entries.
- Parish website check: Holy Trinity, OLPS and Transfiguration need a JS-rendered fetch (`pip install playwright && playwright install chromium` on the VPS; memory is tight).
