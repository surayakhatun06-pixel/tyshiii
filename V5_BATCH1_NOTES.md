# Version 5 — Batch 1 (updated)

- Admin "Run check" now tests anime, episodeLists and siteConfig and shows the Firebase project in use.
- Spotlight (home hero): drag / swipe; choose up to 6 anime + banner links in /admin -> Spotlight.
- Home: hero art runs full-width under the transparent sidebar and top bar and fades smoothly
  into one plain dark page colour. Details/watch pages: banner fades out near the top.
- Latest Episodes: tall posters four across, EP tag, chips, pager moves one set of four.
  Your uploads first, then real AniList releases (Sub). Dub = your uploads only.
- Top Airing: rows with their own faded banners + chips (type, year, episodes, score).
- Phones: Settings gear moved to the top bar (bottom bar has 5 items); watch-page buttons fit one row.
- History page redesigned (search, filter, sort, Pause history, Clear all).
- Details page: "Show" lists every season of the series.

Firestore rules: publish firestore.rules (adds siteConfig; no field-by-field limits).

## Update 2 
- Spotlight: slides cross-fade with a light blur (no sliding, no gap, images preloaded); text stays
  right of the sidebar; soft gradients only. Drag/swipe still changes slide.
- Settings gear: Player background (Transparent / Black / Blurred mix + blur amount) and
  Details page background (Banner / Poster / Only black). Saved in the browser.
- Episode list: slim, quiet scroll bar (hidden until hover); still scrolls with wheel / touch.
- "Coming next season": adds most-anticipated upcoming titles when the season is thin, hides
  finished / music / specials.
- Transparent logo + tab icons in public/.
