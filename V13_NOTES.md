# Version 13

Servers and links
- Every server now has a separate SUB link and DUB link (either can be empty). Yenime example:
  SUB  https://player.yenime.net/anime/ani/{id}/{ep}
  DUB  https://player.yenime.net/anime/ani/{id}/{ep}?dub=1
- Paste a real link (episode 1 of any anime) and the numbers become {id} / {ep} automatically
  (AniList: last two numbers = ID and episode; TMDB: last three = TMDB ID, season, episode).
  Also works for ?ep=3&season=2 style links. There is a "Fix it for me" button for typed links.
- Each link shows a live preview. Old servers (one link with {track}) are converted on load.
- New Admin > Servers page: set servers up once, Bulk import uses them for every anime.

Admin
- Menu: Overview, Episodes, Bulk import, Servers, Anime, Spotlight. Hub has a "Set up and manage" group.
- Bulk import: numbered progress bar across the top (tap to jump), ticks on finished steps,
  one big sticky Import bar that says exactly what is still missing.
