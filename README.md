# MassGoWhere

Find a Catholic Mass in Singapore you can actually make: from where you are, by bus/MRT, car or on foot, and when to leave.

- Website: https://mass.anselmlong.com (Vercel project `massgowhere`, auto-deploys from `main`)
- Telegram bot: runs on the VPS (`systemctl --user status massgowhere-bot`)
- Product brief: [PRODUCT.md](PRODUCT.md)

## How it works

```
parish websites ──(weekly, DeepSeek via OpenRouter)──> data/parishes/<id>.json ─┐
myCatholicSG export (manual, fallback) ──> data/mycatholic.json ────────────────┼─> scripts/build_data.py ─> public/data.json
MOM public holidays ──> data/holidays.json ─────────────────────────────────────┘
public/data.json + OneMap routing ──> api/next.js (public/rank.js) ──> website + Telegram bots
```

- **Source of truth is each parish's own website** (`data/sources.json` lists the page per parish). `scripts/scrape_parishes.py` fetches it, an LLM extracts a structured schedule (JSON schema), results are validated, compared with myCatholicSG (differences recorded in each file's `vs_mycatholic`), and a parish keeps its last good data if anything fails or more than half its Mass slots change (`--force` to accept).
- Parishes with no usable site (Nativity, Star of the Sea, and Holy Trinity until the VPS has Playwright) use the myCatholicSG snapshot.
- **Ranking** (`public/rank.js`, shared by browser and API): a Mass is reachable if now + travel + 5 min ≤ start; take the earliest reachable start, then within 15 minutes of it prefer the shortest trip; never suggest trips over 75 min. Travel times come from OneMap routing (departure time = when you'd leave), falling back to a distance estimate.
- **API**: `GET /api/next?lat=1.3151&lng=103.7652&mode=transit|drive|walk` → `best`, `alternatives`, `nearest`. Bots should call this so every surface gives the same answer.

## Run locally

```sh
cp .env.example .env            # fill in keys (never overwrite an existing .env)
node scripts/dev.js             # http://localhost:8787 (site + /api/next)
node --test test/*.test.js      # schedule + ranking tests
python3 bot/bot.py              # Telegram bot (uses the live API; MASSGOWHERE_API overrides)
```

Add `?preview=1` to the site URL to get the colour palette switcher (Seasonal / Green / Marian blue / Violet / Red). The choice is remembered per browser.

## Refreshing data

- Weekly, automatic: `massgowhere-refresh.timer` on the VPS runs `refresh.sh` every Monday 03:00 SGT → scrape → build → commit + push → Vercel deploys.
- By hand: `sh refresh.sh`, or `python3 scripts/scrape_parishes.py --only 5,6` then `python3 scripts/build_data.py`.
- myCatholicSG fallback (manual only): fetch the export yourself, then `python3 scripts/import_mycatholic.py ~/allsched.json`.
- Public holidays: `data/holidays.json` (MOM, data.gov.sg dataset `d_149b61ad0a22f61c09dc80f2df5bbec8`). Add next year's dataset when MOM publishes it.

## Environment

`.env` (Mac `~/src/massgowhere/.env`, VPS `~/massgowhere/.env`): `OPENROUTER_API_KEY`, `ONEMAP_EMAIL`, `ONEMAP_PASSWORD`, `TELEGRAM_BOT_TOKEN`, optional `OPENROUTER_MODELS`. Vercel needs `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` (already set for production and preview).

## VPS services

```sh
systemctl --user status massgowhere-bot            # Telegram bot
systemctl --user list-timers massgowhere-refresh.timer
journalctl --user -u massgowhere-refresh -n 50     # last refresh log
```

## Open items

- Gospel bot (catholic-bot) one-click button calling `/api/next`: not started; needs a go-ahead since that bot is live.
- Holy Trinity needs a JS-rendered fetch: `pip install playwright && playwright install chromium` on the VPS (memory is tight).
- Events board (vigils, feasts, devotions): data model already keeps Confession, Adoration and Devotion entries.
