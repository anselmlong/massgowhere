# MassGoWhere

Find a Catholic Mass in Singapore you can actually make: from where you are, by bus/MRT, car or on foot, and when to leave.

- Website: https://massgowhere.com (Vercel project `massgowhere`, auto-deploys on every push to `main`). The old `mass.anselmlong.com` stays attached as an alias, not a redirect, because the bots POST to `/api/next` and urllib does not follow redirects on POST
- Telegram bot: runs on the VPS (`systemctl --user status massgowhere-bot`)
- Product brief: [PRODUCT.md](PRODUCT.md)

## How it works

```
myCatholicSG schedules ──(scripts/update_mycatholic.sh)──> data/mycatholic.json ─┐   source of truth
parish websites ──(monthly, DeepSeek via OpenRouter)──> data/parishes/<id>.json ─┼─> scripts/build_data.py ─> public/data.json
rich parish read, Sept 2026 ──(scripts/import_rich.py)──> data/rich/<id>.json ───┤   (build also writes public/parish/<id>.json)
MOM public holidays ──> data/holidays.json ──────────────────────────────────────┘
public/data.json + OneMap routing ──> api/next.js (public/rank.js) ──> website + Telegram bot
```

- **Times come from myCatholicSG.** `scripts/update_mycatholic.sh` reads its Firestore database `prod-sg`, the one mycatholic.sg itself reads (the project's `(default)` database is an old copy that stopped updating in July 2026). `scripts/import_mycatholic.py` turns its export into weekly / nth-week / last-week rules plus dated additions and cancellations.
- **Monthly parish-website check.** `scripts/scrape_parishes.py` reads each parish's own page (`data/sources.json`) with an LLM and compares it with myCatholicSG. It never changes times. The build marks each parish "parish website agrees" or "lists different times", and `data/site-check.md` lists every difference for review.
- **Ranking** (`public/rank.js`, shared by browser and API): a Mass is reachable if now + travel + 5 min ≤ start (trip ≤ 75 min; leave-by gets you there 5 minutes early, to settle in and prepare for Mass; the site and bot say so). In bus & MRT mode a church within a 10-minute walk, or a 15-minute walk that is no slower than the bus, is a walk. Take the earliest reachable start S. Among Masses starting within 90 minutes of S, pick the **shortest trip**; the earlier start breaks ties. Travel comes from OneMap routing at the time you would leave, in two passes (nearest + soonest, then anything else inside the window), falling back to a distance estimate. OneMap's driving route ignores traffic, so car trips are stretched ×1.4 on weekdays 7:30–9:30am and 5:30–8pm (`lib/onemap.js`); bus & MRT already follow the timetable for that time.
- **API**: `GET /api/next?lat=1.3151&lng=103.7652&mode=transit|drive|walk[&part=morning|lunch|evening][&at=<epoch ms>]` (`part` keeps to Masses before noon, noon to 3pm, or from 3pm, as defined in `public/schedule.js`; `at` plans a departure up to 7 days ahead; omitted means now) returns `best`, `alternatives`, `nearest`, `specialDay`, `dataAsOf`. Bots call this so every surface gives the same answer.
- **A bit late**: `late=15` on `/api/next` and `/api/way` counts a Mass that has just started if you'd arrive at most 15 min late. `/api/next` then looks only 30 min past the earliest such Mass and picks the least late (then the shortest trip); `/api/way` counts each late minute double against the detour. Answers carry `lateMin`.
- **Parish details** (church page): a one-off hand-reviewed read of every parish's website, bulletins and posters (29 Sept 2026, kept on the VPS in `~/massgowhere-rich`, with its evidence) was imported with `python3 scripts/import_rich.py ~/massgowhere-rich` into `data/rich/<id>.json`: Adoration, Confession, devotions, church and office hours, public-holiday Masses, dated Mass changes, events, getting there, sacraments, ministries, contacts, livestream, bulletin. Reviewer notes are left out. `build_data.py` merges it field by field with the monthly read below into `public/parish/<id>.json`, which only the church page fetches: the rich read wins while it is under 45 days old (`RICH_FRESH_DAYS`), then the monthly read wins and the rich read only fills gaps. Dated changes and events show from today on.
- **Both sources on the church page**: the week list shows myCatholicSG's Masses and the parish website's regular Masses together. A time on both shows once; a time only one lists carries a tappable "Parish website" / "myCatholicSG" marker that says where it comes from and when it was read. Answers, "Next Mass you can attend", `/api/next` and the bot still use myCatholicSG only. Only a reviewed (rich) cancellation strikes a Mass off the week; the automatic bulletin read only lists changes under "Changes to the usual Masses".
- **This week's bulletin** (daily, `scripts/update_bulletins.sh`): `scripts/fetch_bulletins.py` takes each parish's newest bulletin from myCatholicSG (`prod-sg`, collection `bulletin`; a PDF) into `data/bulletins_latest.json`. When a parish has none from the last 3 weeks it finds the bulletin itself on the page `data/bulletins.json` names: the newest dated link, a PDF under a "bulletin" heading, a Drive file shown inside an embedded app, or an emailed newsletter (St Michael's). St Mary of the Angels posts its news as announcements instead of a bulletin: a Squarespace page, read as JSON (`?format=json`), whose last 3 weeks of posts are its bulletin text and whose card says "parish announcements". An undated one takes its date from its first page. Each bulletin not read yet is then read once by `scrape_parishes.py --only <ids>` with the parish's website, for one-off Mass changes (`dated`), `events` and parish info. A dated change is kept only when the text states its date and time near each other within 45 days, a cancellation also hits a myCatholicSG slot with "no/cancelled/moved" nearby, and a "public holiday" Mass falls on one. Dated changes and events from this read and the rich read are both shown. The church page's bulletin card opens it ("This week" up to 9 days old, "Latest" up to 21; a title naming an older Sunday than the upload date counts from that Sunday), and says "No current bulletin online" with the parish website otherwise. Image-only bulletins are linked but give no text.
- **Parish info**: the monthly parish-website read (`scripts/scrape_parishes.py`) also extracts `info` (Adoration hours incl. an Adoration room's opening hours and Holy Hour, Confession, devotions, office hours, good to know); `build_data.py` fills whatever the rich read lacks and the church page shows it in place of myCatholicSG's service times. Run `python3 scripts/scrape_parishes.py && python3 scripts/build_data.py` on the VPS to fill it now.
- **On the way** (`public/way.js`, `GET /api/way?from=lat,lng&to=lat,lng&mode=…[&at=…][&by=…]`): the Mass that adds least to a trip from A to B (and still gets you to B by `by`, if given). Mass length is assumed: about 60 min on Sundays and Saturday evenings, 40 min otherwise. Straight-line detour shortlists 8 churches; OneMap routes both legs of each.
- **Feedback**: the site's footer form posts to `/api/feedback`, which sends it to Anselm on Telegram. Needs `TELEGRAM_BOT_TOKEN` in the Vercel project (`FEEDBACK_CHAT_ID` overrides where it goes). The bot's `/feedback` does the same, and asks for feedback once after a person's 3rd and 15th answer.
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
| myCatholicSG times (source of truth) | `sh scripts/update_mycatholic.sh`: fetch, import, build, commit, push | VPS crontab, daily 04:00 server time (UTC, so 12:00 SGT); log in `~/mgw.log`. Or run it by hand. |
| Parish website check | `sh scripts/check_sites.sh`, monthly | VPS timer `massgowhere-check.timer`, 1st of each month, 03:00 SGT |
| This week's bulletins | `sh scripts/update_bulletins.sh`: fetch, read the new ones, build, commit, push | VPS crontab, daily 04:30 server time (UTC, so 12:30 SGT), and Fri + Sat 13:00 UTC (9pm SGT, after most parishes upload); log in `~/mgw-bulletins.log` |
| Church photos | `python3 scripts/fetch_photos.py` (Wikimedia Commons picks in `data/photo_picks.json`); `python3 scripts/fetch_mycatholic_photos.py` fills the rest with myCatholicSG's own photo (macOS) | By hand; both merge into `public/photos/credits.json` |
| Public holidays | edit `data/holidays.json` when MOM publishes next year's list | The build warns when fewer than 60 days remain |

Both scripts start from `origin/main` (`git reset --hard`), take a lock (`flock`, Linux), and only commit regenerated files.

Daily myCatholicSG and bulletin refreshes, installed on the VPS (`crontab -l`). To set it up again on a new machine:

```sh
(crontab -l 2>/dev/null; echo '0 4 * * * sh $HOME/massgowhere/scripts/update_mycatholic.sh >>$HOME/mgw.log 2>&1') | crontab -
(crontab -l 2>/dev/null; echo '30 4 * * * sh $HOME/massgowhere/scripts/update_bulletins.sh >>$HOME/mgw-bulletins.log 2>&1') | crontab -
(crontab -l 2>/dev/null; echo '0 13 * * 5,6 sh $HOME/massgowhere/scripts/update_bulletins.sh >>$HOME/mgw-bulletins.log 2>&1') | crontab -
```

## Environment

`.env` on the Mac (`~/src/massgowhere/.env`) and the VPS (`~/massgowhere/.env`) holds `OPENROUTER_API_KEY`, `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` and `TELEGRAM_BOT_TOKEN`; `OPENROUTER_MODELS` is optional. Vercel needs `ONEMAP_EMAIL` and `ONEMAP_PASSWORD`, which are set for production and preview.

## VPS services

```sh
systemctl --user status massgowhere-bot
systemctl --user list-timers massgowhere-check.timer
journalctl --user -u massgowhere-check -n 50
tail ~/mgw.log                                  # daily myCatholicSG refresh (cron)
```

## Open items

- Gospel bot (catholic-bot): a **⛪ Nearest Mass** button calls `/api/next` (bus & MRT, leaving now) and points to @massgowherebot for more.
- Events board (vigils, feasts, devotions): the data model already keeps Confession, Adoration and Devotion entries.
- Parish website check: Playwright is installed on the VPS for JS-built sites (Holy Trinity now works). Cathedral (Cloudflare), OLPS and Transfiguration show a bot check to headless browsers and stay unchecked. Star of the Sea's schedule is only an image and Nativity has no public website; both use myCatholicSG alone.
