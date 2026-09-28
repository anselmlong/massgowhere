# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Catholics in Singapore who want to get to Mass today, often away from their own parish: at work, visiting family, travelling across the island. They open the site on a phone, usually in a hurry, and need an answer they can act on straight away.

## Product Purpose

MassGoWhere answers one question: which Mass can I actually make from where I am, and how do I get there. It combines each parish's published Mass times with real travel time (walking, driving or public transport) and the current time, and hands off to Google Maps for navigation.

Success: a user finds a church they can make **within one minute**, faster and with less effort than searching "nearest church" on Google and working out times and routes themselves.

## Positioning

Not "nearest church" and not a timetable directory. It picks the Mass you can *reach in time*, given your location, the Mass schedule, and how you travel, and tells you when to leave.

## Operating Context

- Main surface: a mobile website at massgowhere.com.
- The same ranking is served from one API endpoint (`/api/next`) so a dedicated Telegram bot and a one-click button in the existing daily-gospel Telegram bot (catholic-bot) show identical answers. The gospel bot already has an established user base among the owner's friends.
- Schedules are refreshed weekly from each parish's own website (source of truth), read by two LLMs that vote; myCatholicSG is the fallback and tie-breaker. Travel times come from OneMap (Singapore Land Authority).

## Capabilities and Constraints

- User stories: locate the nearest church; locate the soonest Mass; navigate to the Mass that is soonest *and* realistically reachable by the chosen mode.
- Future (not yet built): an events board for special Masses (vigils, feasts) and other parish events. The data model already keeps Confession, Adoration and devotions.
- Every page carries one main message; clutter is a defect.
- Times can be wrong or change: always show the source and when it was checked, and link to the parish.
- 32 parishes in Singapore.

## Brand Commitments

- Name: **MassGoWhere** (Singapore "GoWhere" naming).
- Voice: warm and gently devotional, but the answer comes first and plainly (time, church, when to leave). No emojis, no preachiness.
- Clean and professional. Colour palette to be chosen by the owner from options.

## Evidence on Hand

Real data only: 32 parishes (myCatholicSG, geocoded via OneMap), parish websites, OneMap routing. No testimonials, user counts, or endorsements exist; do not invent any. Not affiliated with the Archdiocese; do not imply it.

## Product Principles

1. The answer first: the one Mass you can make, and when to leave.
2. Honest about uncertainty: show source, freshness and estimates as estimates.
3. One action per screen; everything else is one tap away, not on the page.
4. Same answer everywhere: web and bots share one ranking.

## Accessibility & Inclusion

WCAG 2.2 AA contrast in light and dark mode, tap targets of at least 44px, respects system text size and reduced motion.
