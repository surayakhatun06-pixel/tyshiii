# Version 12 — Bulk import with TMDB

- Bulk import has two ways to find a series: AniList, or TMDB (title or TMDB code).
- Opening Bulk from an anime's admin finds the exact TMDB series by itself (title + year), shows its
  seasons and episode counts, and offers other matches if it isn't sure. You can type a different TMDB code.
- Every server chooses what its link uses: AniList ID ({id}, {ep}) or TMDB ID ({tmdb}, {season}, {ep}).
- TMDB servers get the right season and the right episode inside that season. 40 site episodes over
  4 TMDB seasons of 10 become S1 E1 ... S4 E10 (episode 15 = S2 E5). Works whether AniList has one
  entry per season or one long entry. Each entry can start at a chosen TMDB season/episode if the guess is off.
- Paste a link with the real code in it (.../tv/65249/1/{ep}) and tap "Fix it for me".
- Still airing: "Add new episodes" carries on from the last TMDB season/episode.
- TMDB key lives in src/lib/tmdb.ts; set VITE_TMDB_API_KEY to use a different one.
