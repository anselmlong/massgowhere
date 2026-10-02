# Changelog

Grouped by day of release (Singapore time). The site deploys on every merge to `main`. Bot changes go live after a restart on the VPS.

## 0.5: 2 Oct 2026 (this tester round)

### Data
- **Mass times now come from myCatholicSG's live database** (`prod-sg`). The daily refresh had been reading an old copy that stopped updating on 3 July. Six parishes had changed since, e.g. St Michael's Saturday Mass moved from 6:30 to 7:30am, and OLPS added a Thursday 6:30am Mass. (#25)
- **This week's bulletin for every church, read daily.**
  - Each parish's newest bulletin comes from myCatholicSG, or from the parish website when it isn't there; 31 of 32 are current.
  - Each new bulletin is read once for one-off Mass changes and events; Mass times are never changed.
  - The church page has a bulletin card. (#26)
- **A photo for all 32 churches**, with credits and small thumbnails. (#26)

### Answer page
- **A map under the answer**, centred on you:
  - Each church pin is labelled with the next Mass you can make there.
  - Our pick is dark, churches in the list are lighter, and other nearby churches are grey. A grey pin's card says why it isn't listed: its Mass is later, or the trip is longer.
  - Two fingers move the map, so scrolling the page doesn't get stuck. (#16, #17, #22, #23)
- **A small photo of the church beside the time**; tap it to see it full size, with the photo credit. (#20, #21)
- **Leave times are clearer.**
  - The headline is always "Leave by <latest time>". A planned trip adds "Leaving at X gets you there by Y".
  - Trip times say "away" or "walk", and never "0 min". (#16, #20)
- **The leave-time bar is one button**, "Leaving now · Change", instead of arrows. (#16)
- **A note appears only when a Mass isn't on the parish website.** It used to be a general caution on every answer. (#16)

### Sunday and Sunset Mass
- **"Sunday or Sunset Mass" replaces "Weekend Mass"**, and Saturday Masses from 4pm are marked **Sunset** on the answer, the list and church pages. (#19)
- **Telegram bot:** a "Sunday or Sunset Mass" button under every answer, and Sunset Masses labelled. (#19; needs a bot restart)

### Home
- **The last step, "Which Mass?", uses big cards like the other steps:** Any Mass, Sunday or Sunset Mass, Morning, Lunchtime, Evening. Tapping one searches straight away. Language is set just above the cards. (#22, #24)
- **Less repeated text.** The small descriptions under options that repeated the label are gone, and so is the summary line above the last step. "How does this work?" is now a plain link. (#16, #20)
- **"Why I built this" is gone** from the footer. (#24)
- **The season label in the header is shorter**, e.g. "Ordinary Time". (#16)

### Church page
- **Mass times are one row per day**, with the times side by side and the language or place underneath. (#18)
- **A shorter page.** Parish events are folded away with the other extras, and there are fewer repeated "check with the parish" notes. (#16, #20)

### Catch a Mass on the way
- **Clearer map and answer.** No straight dashed line on the map, pins show Mass times, and the other options say "7:39am at Orchard MRT". (#16)

### Look and feel
- **No outlines.** Fields, dropdowns, chips and lists use soft filled backgrounds, and a chosen option is tinted instead of ringed. (#22)

## 0.4: 1 Oct 2026
- **Home is a step-by-step wizard:** what, from where, when, how, which Mass.
- **Find an open Adoration room or Confession near you.** Adoration room hours were hand-checked from parish websites.
- **Church pages carry everything the parish website says:**
  - Adoration, Confession, public-holiday Masses, changes to the usual Masses, events, getting there, sacraments, groups, contact.
  - Masses the parish has cancelled are marked.
  - Times from the parish website appear next to myCatholicSG's, with a marker when only one source lists a time.
- **Church photos** from Wikimedia Commons, Flickr and parish websites, with credits.
- **Mass language option on home**, and parish text rewritten for visitors.
- **The churches list shows every church**, with filters behind a toggle.
- **Light mode by default**, with a switch in the header.
- **Padre Pio quote on the home page.**
- **Catch a Mass on the way, simplified** to three times: leave by, Mass, reach your destination.
- **Explanations sit behind a tap**, with one main action per screen.

## 0.3: 30 Sep 2026
- **"Catch a Mass on the way":** from A to B, the Mass that adds least to your trip, optionally arriving by a set time.
- **Feedback** from the website footer and the bot's `/feedback`, straight to the owner on Telegram.
- **Answers appear once**, without jumping from an estimate to live times in most cases.
- **Back to arriving 5 minutes early**, with a note that it's time to prepare for Mass.
- **Rush-hour driving times.**
- **A monthly parish-website check** reads the latest bulletin too.

## 0.2: 29 Sep 2026
- **Moved to massgowhere.com.**
- **Plan ahead:** a leave time up to a week away.
- **Time-of-day filter** (morning, lunchtime, evening).
- **A browsable "All churches"** map and list with filters.
- **Walk instead of the bus** when a church is that close.
- **Full-colour street map.**
- **Design pass:** season colours, live leave-by countdown, motion, home-screen icon.
- **Metrics:** Vercel Web Analytics on the site, `/stats` in the bot.

## 0.1: 28 Sep 2026
- **First version:**
  - The Mass you can still make from where you are, by bus & MRT, car or on foot.
  - Real travel times from OneMap.
  - myCatholicSG schedules, refreshed daily.
  - `/api/next`, shared by the website and the Telegram bot.
- **Telegram bot @massgowherebot.**
- **Nearest Mass button in the daily gospel bot.**
