# MassGoWhere

Find a Catholic Mass in Singapore you can actually make: from where you are, by bus & MRT, car or on foot, and when to leave.

- **Website:** https://massgowhere.com (Vercel project `massgowhere`, auto-deploys on every push to `main`). The old `mass.anselmlong.com` stays attached as an alias, not a redirect, because the bots call `/api/next` and urllib doesn't follow redirects.
- **Telegram bot:** [@massgowherebot](https://t.me/massgowherebot), on the VPS (`systemctl --user status massgowhere-bot`).
- **Gospel bot:** the daily-gospel bot (`anselmlong/catholic-bot`) has a **Nearest Mass** button that calls `/api/next`.
- **Product brief:** [PRODUCT.md](PRODUCT.md). **Changes:** [CHANGELOG.md](CHANGELOG.md). **For testers:** [RELEASE_NOTES.md](RELEASE_NOTES.md).

---

## 1. What it does

| Surface | What you get |
|---|---|
| **Find a Mass** (home → answer) | The Mass you can still make, when to leave, and how long the trip takes. Below it: a map with the churches around you, each labelled with its next reachable Mass, then the other churches you can make it to, and the nearest church. Navigate hands off to Google Maps. |
| **Plan ahead** | "Leaving later": any departure time up to 7 days ahead. Narrow to Sunday or Sunset Mass, morning, lunchtime or evening, or a language. |
| **Catch a Mass on the way** (`#/way`) | Going from A to B, maybe needing to be at B by a set time: which Mass adds the least to the trip. The answer is three times: leave by, Mass, reach B. |
| **Adoration / Confession** (`#/open`) | An Adoration room that's open (or opens soon), or Confession you can get to. |
| **Church page** (`#/church/:id`) | Photo, next Mass you can attend, this week's Masses by day, changes to the usual Masses, Adoration, Confession, this week's bulletin, parish details, and sources. |
| **All churches** (`#/churches`) | Map of all 32 parishes, or a list with filters (day, time, language, distance, sort). |
| **Telegram bot** | The same answer as the site: share your location or send a postal code. Travel-mode buttons, a "Sunday or Sunset Mass" button, "Catch a Mass on the way", `/feedback`. |

---

## 2. Architecture

```
                         ┌──────────────────────── data pipeline (VPS, cron) ─────────────────────────┐
myCatholicSG Firestore ──┤ update_mycatholic.sh → import_mycatholic.py → data/mycatholic.json          │
  (prod-sg, daily)       │                                                                            │
parish websites ─────────┤ check_sites.sh → scrape_parishes.py (LLM) → data/parishes/<id>.json         │
  (monthly)              │                                                                            ├─→ build_data.py ─→ public/data.json
bulletins ───────────────┤ update_bulletins.sh → fetch_bulletins.py → scrape_parishes.py --only …      │                    public/parish/<id>.json
  (daily + Fri/Sat 9pm)  │                                                                            │
hand-reviewed read ──────┤ import_rich.py → data/rich/<id>.json  ·  data/services.json (hand-checked)  │
MOM public holidays ─────┘ data/holidays.json                                                         ┘
                                                     │ git commit + push to main
                                                     ▼
                                   Vercel (static public/ + serverless api/)
                         ┌──────────────────────────────────────────────────────────────┐
  browser (SPA) ─────────┤ public/index.html, app.js, style.css                          │
     │  shares the same  │ public/schedule.js · rank.js · services.js · way.js  ◄────────┼── also required by api/*
     │  ranking code     │ api/next.js  api/way.js  api/feedback.js                      │
     ▼                   └───────────────┬──────────────────────────────┬───────────────┘
  MapLibre + OpenFreeMap tiles           │ lib/onemap.js                │ Telegram sendMessage
                                         ▼                              ▼
                               OneMap routing (SLA)            owner's Telegram (feedback)
  Telegram bot (bot/bot.py, VPS) ──── GET /api/next, /api/way ────┘
  Gospel bot (catholic-bot)     ──── GET /api/next
```

**Design principles**
- **One answer everywhere.** The ranking lives in `public/rank.js` (plain JS, no build step). The browser loads it, and the API `require`s it. The bots never rank; they call the API. So the site, the bot and the gospel bot always agree.
- **Static data, live routing.** Mass times are a static JSON snapshot rebuilt by cron and deployed by git push. Only travel time is live, from OneMap.
- **Never block on the slow part.** The browser asks for an estimate-only answer (`fast=1`, a few ms) and the live answer together. It waits up to 2.5 s (3 s for "on the way") for live, so most answers appear once. If live is slow, the estimate shows first and the live times settle in place without a repaint.
- **Works offline-ish.** If the API fails, the browser ranks with `data.json` and distance estimates.

---

## 3. Components

### 3.1 Front end (`public/`)

- **Stack:** vanilla JS single-page app, no framework and no build step. Hash routes: `#/`, `#/next`, `#/church/:id`, `#/churches`, `#/way`, `#/open`. One stylesheet. Font: Atkinson Hyperlegible Next (Google Fonts). Vercel Web Analytics records hash-route pageviews.
- **Maps:** MapLibre GL 5.24, loaded from jsdelivr on demand. The home screen prefetches it in idle time. OpenFreeMap "liberty" style. The answer's map loads when scrolled near (IntersectionObserver) and needs two fingers to move (`cooperativeGestures`).
- **Home:** a step-by-step wizard: what (Mass / Adoration room / Confession) → from where → when → how → which Mass. Each tap moves on; on the last step, tapping a Mass card searches. Other layouts (simple, list, quick picks) are available behind `?preview=1`.
- **Answer (`#/next`):**
  - The time, with the church's photo beside it (tap to enlarge) and the church name.
  - "Leave by …", with the trip time and "You'll arrive 5 min early, to prepare for Mass". A planned trip adds "Leaving at X gets you there by Y".
  - Navigate.
  - The map:
    - Our pick: dark pin.
    - Churches in the list below: lighter pins.
    - Also nearby, not listed: grey pins. The card says why (a later Mass, or a longer trip).
  - Other churches you can make it to, and the nearest church.
  - Source line: warns when this Mass isn't on the parish website.
  - Saturday Masses from 4pm are marked **Sunset Mass**.
- **Church page:**
  - Mass times: one row per day, times in a three-column grid.
  - Times from myCatholicSG and the parish website are merged. A time only one source lists carries a tappable source marker.
  - Changes to the usual Masses, and Adoration / Confession / public holidays.
  - Bulletin card, and folded extras: events, getting there, sacraments, groups, contact.
- **Look:** light by default, with a header switch (dark follows the phone otherwise). The accent colour follows the liturgical season (`season()` in `app.js`); the header shows the season, e.g. "Ordinary Time". Fills, not outlines. 44px tap targets. Reduced-motion respected.
- **Files:** `app.js` (UI, ~2,000 lines), `schedule.js` (`MassSchedule`), `rank.js` (`MassRank`), `services.js` (`MassServices`), `way.js` (`MassWay`), `data.json` (schedule snapshot), `parish/<id>.json` (church-page details, fetched per page), `photos/<id>.jpg` + `photos/thumb/<id>.jpg` (144px squares) + `photos/credits.json`.

### 3.2 API (`api/`, Vercel Node functions)

All endpoints return JSON with `Cache-Control: no-store`.

**`GET /api/next`**: the Mass you can make.

| Param | Values | Default |
|---|---|---|
| `lat`, `lng` | a point in Singapore (rough box: 1.15–1.475, 103.59–104.1) | required; `400` outside |
| `mode` | `transit` \| `drive` \| `walk` | `transit` |
| `at` | epoch ms or ISO time, up to 7 days ahead | now |
| `part` | `morning` (before noon) \| `lunch` (noon–3pm) \| `evening` (from 3pm) | any |
| `sunday` | `1`: Sunday, or Saturday from 4pm (Sunset Mass) | off |
| `lang` | e.g. `Mandarin`, `Tagalog` | any |
| `late` | up to `15`: count a Mass you'd walk into at most this many minutes late | 0 |
| `fast` | `1`: distance estimates only, no OneMap (instant first frame) | off |
| `kind` | `adoration` \| `confession`: an open Adoration room or Confession instead | Mass |

Response:
- `best`, `alternatives[≤3]`, and each of those has:
  - `parish{id,name,address,postal,lat,lng}`, `start`, `leaveBy`, `language`, `location`, `note`
  - `travelMin`, `travelSource` (`onemap` or `estimate`), `walk`, `lateMin`, `distanceKm`
- `nearest{parish,travelMin,walk,next}`
- `around[≤5]`: the closest churches by distance, each with its next reachable Mass, for the map.
- `specialDay`, `dataAsOf`, and the inputs echoed back.
- With `kind`: `best`, `alternatives`, `checked`, and `unconfirmed` (parishes whose times aren't clear).

**`GET /api/way?from=lat,lng&to=lat,lng&mode=…[&at=…][&by=…][&late=15][&fast=1]`**: a Mass on the way.
- Response: `best`, `alternatives`, `direct`. Each stop has `start`, `end`, `leaveBy`, `arrive`, `toMin`, `onwardMin`, `detourMin`, `lateMin`.

**`POST /api/feedback {message, contact?, page?}`**: forwards the message to the owner on Telegram.
- Limits: honeypot field, at most 5 messages per 10 min per IP, 2,000 characters.

### 3.3 Ranking rules (`public/rank.js`, `services.js`, `way.js`)

**Next Mass (`rank`)**
1. **Reachable:** leave now (or at `at`), travel, and arrive `BUFFER_MIN` (5) minutes before the start. Trips over `MAX_TRIP_MIN` (75) are never suggested.
2. **Window:** take the earliest reachable start S. Among Masses starting within `WINDOW_MIN` (90) of S, the **shortest trip** wins; the earlier start breaks ties.
3. **Alternatives:** other churches in the window by trip length, then later Masses by start. At most 3, one per church.
4. **Nearest:** the church with the shortest routed trip, whatever its Mass time.
5. **Around:** the 5 closest by distance, with their next reachable Mass.
6. **A bit late (`late=15`):** the window shrinks to `LATE_WINDOW_MIN` (30), and the least-late Mass wins, then the shortest trip. This is hidden in the UI for now (`LATE_UI = false`).

**Routing**
- Every church first gets a distance estimate.
- OneMap then routes a shortlist, timed for when you'd actually set off:
  - pass 1: the 5 nearest churches with a reachable Mass, the 3 with the soonest Mass, and the 2 nearest overall;
  - pass 2: anything else inside the window, up to `MAX_ROUTED`.
- Each OneMap call has 3.5 s (`tripMinutesWithin`, `lib/onemap.js`); a slower one falls back to the estimate for that church, so one slow route can't hold up the answer.
- In bus & MRT mode, a church within a 10-minute walk, or a 15-minute walk that's no slower than the bus, becomes a walk (`preferWalk`).
- Bus & MRT routes follow the timetable for the departure time, so very early trips (before about 6:30am) come out slower.
- Car trips are stretched ×1.4 on weekdays 7:30–9:30am and 5:30–8pm, because OneMap's driving route ignores traffic.

**Adoration / Confession (`services.js`)**
- **Windows:** an Adoration room's hours, Confession slots, and "N minutes before Mass" worked out from the Mass times.
- **Reachable:** arrive at least 20 min before a room closes, or 10 min before Confession ends.
- **Window:** earliest arrival, then the shortest trip within 60 min (6 h for Confession).
- **Data:** `data/services.json` (hand-checked).

**On the way (`way.js`)**
- **Detour:** (A→church) + (church→B) − (A→B).
- **Mass length:** assumed to be 60 min on Sundays and Saturday evenings, 40 min otherwise.
- **Shortlist:** straight-line detour picks 8 churches; OneMap routes both legs of each.
- **Fits** if you arrive 5 min early and, with `by`, still reach B in time.
- **Order:** the smallest detour wins (with `late`, each late minute counts double). Without a deadline, only Masses within 120 min of the earliest one that fits count.

**Schedule expansion (`schedule.js`)**
- Recurring rules: weekly, nth week of the month, last week.
- Dated additions and cancellations.
- Liturgical helpers: Easter, Epiphany and Baptism dating for Singapore, special days (public holidays, Christmas, Triduum). Special days get a "times may differ" notice; they aren't modelled as schedule changes.
- `isSunset`, `forSunday`, and the time-of-day `PARTS`.

### 3.4 Data pipeline (`scripts/`, VPS)

- **Mass times: myCatholicSG is the source of truth.**
  - `update_mycatholic.sh` reads the Firestore database `prod-sg`, the one mycatholic.sg itself reads. The `(default)` database is an old copy that stopped updating on 3 July 2026.
  - `import_mycatholic.py` turns the export into weekly, nth-week and last-week rules plus dated additions and cancellations.
- **Monthly parish-website check** (`scrape_parishes.py`, LLM via OpenRouter):
  - It reads each parish's own page (`data/sources.json`) and compares it with myCatholicSG. It **never changes times.**
  - The build marks each parish "parish website agrees" or "lists different times", and `data/site-check.md` lists every difference for review.
  - The same read extracts `info`: Adoration and Adoration-room hours, Confession, devotions, office hours, good to know.
  - Playwright handles JS-built sites. The Cathedral, OLPS and Transfiguration block headless browsers. Star of the Sea's schedule is an image only, and Nativity has no website; both use myCatholicSG alone.
- **This week's bulletin** (daily, plus Friday and Saturday at 9pm SGT):
  - **Finding it:** `fetch_bulletins.py` takes each parish's newest bulletin from myCatholicSG (`prod-sg`, collection `bulletin`; a PDF). Failing that, it finds the bulletin on the page `data/bulletins.json` names: the newest dated link, a PDF under a "bulletin" heading, a Drive file in an embedded app, or an emailed newsletter (St Michael's).
  - **Reading it:** each new bulletin is read once (`scrape_parishes.py --only <ids>`) for one-off Mass changes (`dated`), events and parish info.
  - **What's kept:**
    - A dated change only when its date and time are stated near each other, within 45 days.
    - A cancellation only when it also matches a myCatholicSG slot with "no / cancelled / moved" nearby.
    - A "public holiday" Mass only when it falls on one.
  - **Freshness:** the card says "This week" up to 9 days old and "Latest" up to 21. St Mary of the Angels publishes none.
- **Hand-reviewed parish read** (29 Sept 2026):
  - Imported with `import_rich.py` into `data/rich/<id>.json`.
  - It wins over the monthly read while under 45 days old (`RICH_FRESH_DAYS`); after that it only fills gaps.
  - Only a reviewed cancellation strikes a Mass off the church page's week.
- **Build:** `build_data.py` writes `public/data.json` (all parishes, rules, dated changes, services, holidays, bulletin per parish) and `public/parish/<id>.json`. It warns when fewer than 60 days of public holidays remain.
- **Photos:**
  - All 32 parishes have a photo, from Wikimedia Commons, Flickr, the parish's own website or myCatholicSG.
  - Credits are in `public/photos/credits.json`; each photo is self-hosted with a 144px thumbnail.
  - Scripts: `fetch_photos.py`, `fetch_mycatholic_photos.py` (macOS `sips`), `find_*`.

### 3.5 Telegram bot (`bot/bot.py`)

- **Runtime:** Python 3 standard library only. It long-polls the Bot API and calls `MASSGOWHERE_API` (default `https://massgowhere.com`) for every answer.
- **Answering:** replies instantly with a placeholder, and asks for the live answer and the estimate together. If the live answer lands within 3 s it shows that; otherwise it shows the estimate (usually ready by then) and edits it when the live answer arrives.
- **Newest request wins:** taps are acknowledged as soon as they arrive. A newer location, place, or mode or Sunday tap makes an answer still loading for that chat stop at once (it never edits the chat, and its "Looking for…" message is removed). Mode and Sunday buttons carry their answer's location and update that message in place.
- **Buttons:** Navigate, Mass times, Open on the website, travel mode (remembered per chat), Sunday or Sunset Mass ↔ Any Mass.
- **On the way:** a three-step flow (from → to → be there by), with a numbered three-step answer.
- **`/feedback`:** forwards to the owner. It also asks for feedback once after a person's 3rd and 15th answer.
- **`/stats`** (admins only): daily counts, with people as salted hashes.
- **Privacy:** no locations are stored, only each chat's travel mode.
- **Files:** `bot/state.json`, `nudges.json`, `stats.json`, `feedback.log` (all git-ignored on the VPS).

---

## 4. Technical specs

| | |
|---|---|
| Runtime | Vercel static hosting (`public/`) + Node serverless functions (`api/`); no build step (`vercel.json`: `outputDirectory: public`, no framework) |
| Client | Vanilla ES2020+, no dependencies. MapLibre GL 5.24 loaded on demand. Uses `:has()`, `<dialog>`, `IntersectionObserver`, `color-mix()`; current Safari / Chrome / Firefox |
| Routing provider | OneMap (Singapore Land Authority): `/api/public/routingsvc/route`. Token from email + password, cached ~72 h; one shared in-flight login; retried on 401. Route cache in memory, keyed by origin (3 dp), destination, mode and 15-minute departure slot |
| Map tiles | OpenFreeMap "liberty" (no key) |
| Data size | `data.json` holds 32 parishes with rules, dated changes, services, holidays and bulletins; `parish/<id>.json` is fetched only by the church page; thumbnails ~8 KB each |
| Timezone | All times are epoch ms / ISO UTC; Singapore time is UTC+8 with no DST (`SGT_OFFSET_MS`) |
| Analytics | Vercel Web Analytics (cookieless) on the site; `/stats` in the bot |
| Privacy | No accounts. Location is used in the browser and sent to `/api/next` per request, never stored. Recent places live in the browser's `localStorage` only |
| Bot runtime | Python 3, standard library only; systemd user service on the VPS |
| Data scripts | Python 3, standard library (urllib); LLM reads via OpenRouter (default `deepseek/deepseek-v4.1-flash`); Playwright for JS sites; `flock` locking; scripts reset to `origin/main` and commit only regenerated files |
| Tests | `node --test test/*.test.js`: schedule expansion, ranking, services, on-the-way, OneMap parsing, API, parish text |

### Key constants

| Constant | Value | Where |
|---|---|---|
| Arrive early | 5 min | `rank.js` `BUFFER_MIN` |
| Answer window | 90 min (30 when "a bit late") | `rank.js` `WINDOW_MIN`, `LATE_WINDOW_MIN` |
| Longest trip suggested | 75 min | `rank.js` `MAX_TRIP_MIN` |
| Walk instead of bus | ≤10 min, or ≤15 min if no slower | `rank.js` `SHORT_WALK_MIN`, `MAX_WALK_MIN` |
| A bit late | ≤15 min | `rank.js` `MAX_LATE_MIN` |
| Search horizon | 2 days (7 for Sunday or a language; 7 for Confession) | `api/next.js`, `services.js` |
| Plan ahead | up to 7 days | `api/next.js` `PLAN_DAYS` |
| Sunset Mass | Saturday from 4pm | `schedule.js` `SUNDAY_EVE_MIN` |
| Rush-hour driving | ×1.4, weekdays 7:30–9:30am, 5:30–8pm | `lib/onemap.js` |
| Wait for live answer | 2.5 s site, 3 s bot and "on the way" | `app.js`, `bot.py` |

---

## 5. Run locally

```sh
cp -n .env.example .env         # -n: never overwrite an existing .env
node scripts/dev.js             # http://localhost:8787 (site + /api/*; reads .env literally)
node --test test/*.test.js      # all tests
python3 bot/bot.py              # Telegram bot (uses the live API; MASSGOWHERE_API overrides)
```

Without OneMap credentials, the API answers with distance estimates. Add `?preview=1` for the design options (home layouts, colours, fonts); the choice is remembered per browser.

## 6. Environment

| Variable | Where | For |
|---|---|---|
| `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` | Vercel (production + preview), `.env` | routing |
| `TELEGRAM_BOT_TOKEN` | Vercel (for `/api/feedback`), VPS `.env` (bot) | feedback, bot |
| `FEEDBACK_CHAT_ID` | optional, Vercel / VPS | where feedback goes (default: the owner) |
| `ADMIN_CHAT_IDS` | optional, VPS | who can use `/stats` |
| `MASSGOWHERE_API` | optional, VPS | the site the bot calls |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODELS` | VPS / Mac `.env` | parish-website and bulletin reads |

## 7. Operations

| What | How | Schedule |
|---|---|---|
| myCatholicSG times | `sh scripts/update_mycatholic.sh` (fetch, import, build, commit, push) | VPS cron, daily 04:00 UTC (12:00 SGT); `~/mgw.log` |
| This week's bulletins | `sh scripts/update_bulletins.sh` | VPS cron, daily 04:30 UTC, and Fri + Sat 13:00 UTC (9pm SGT); `~/mgw-bulletins.log` |
| Parish website check | `sh scripts/check_sites.sh` | VPS timer `massgowhere-check.timer`, 1st of each month, 03:00 SGT |
| Church photos | `scripts/fetch_photos.py`, `scripts/fetch_mycatholic_photos.py` | by hand |
| Public holidays | edit `data/holidays.json` when MOM publishes next year's list | build warns at < 60 days |
| Bot changes | `git pull` on the VPS, then `systemctl --user restart massgowhere-bot` | after any change to `bot/bot.py` |

```sh
# cron, to set up again on a new machine
(crontab -l 2>/dev/null; echo '0 4 * * * sh $HOME/massgowhere/scripts/update_mycatholic.sh >>$HOME/mgw.log 2>&1') | crontab -
(crontab -l 2>/dev/null; echo '30 4 * * * sh $HOME/massgowhere/scripts/update_bulletins.sh >>$HOME/mgw-bulletins.log 2>&1') | crontab -
(crontab -l 2>/dev/null; echo '0 13 * * 5,6 sh $HOME/massgowhere/scripts/update_bulletins.sh >>$HOME/mgw-bulletins.log 2>&1') | crontab -

# health
systemctl --user status massgowhere-bot
systemctl --user list-timers massgowhere-check.timer
journalctl --user -u massgowhere-check -n 50
tail ~/mgw.log ~/mgw-bulletins.log
```

## 8. Repository layout

```
api/           next.js · way.js · feedback.js          Vercel functions
lib/           onemap.js                               OneMap auth, routing, cache, walk-vs-bus
public/        index.html · app.js · style.css         the site
               schedule.js · rank.js · services.js · way.js   shared logic (browser + API)
               data.json · parish/<id>.json · photos/          generated data and photos
bot/           bot.py                                  Telegram bot
scripts/       update_*.sh · check_sites.sh            cron entry points
               import_*.py · scrape_parishes.py · fetch_*.py · build_data.py · dev.js
data/          mycatholic.json · services.json · holidays.json · sources.json · bulletins*.json
               parishes/<id>.json · rich/<id>.json · site-check.md
test/          node:test suites
```

## 9. Known limits and open items

- **Public holidays, Christmas and the Triduum** aren't modelled as schedule changes. The site and bot show a "times may differ, check with the parish" notice instead.
- **Early-morning bus & MRT trips** are routed for when you'd set off, so a 6:30am Mass can look like a longer trip than the same church later in the day.
- **Adoration and Confession coverage:** about 12 parishes have unclear or missing times. Those parishes are listed as unconfirmed rather than guessed.
- **Automatic bulletin reads** can miss or misread a change. Only a reviewed cancellation strikes a Mass off.
- **"A bit late"** is built but hidden (`LATE_UI = false`).
- **Not built yet:** an events board (vigils, feasts, devotions); the data model already keeps those entries.
