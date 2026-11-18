# Version 15

Sub / Dub stuck on Sub (fixed)
- The embed player remembers a language you pick inside it and then ignores ?lang=sub / ?lang=dub in the link.
  The player now loads with empty, throw-away storage every time ("Fresh player", Chrome and Brave), so the
  Sub and Dub buttons on this site always win. Switch it in Settings > Player protection, or in the watch
  page's three-dots menu ("Fresh player (Sub/Dub fix)").

Ad shield (new)
- Unknown embed players (anime players) now run in a locked box: no pop-up tabs, no redirects to other sites,
  no downloads, no dialog boxes. This is what stops the invisible "click anywhere and you land on an ad site"
  layer. Video, fullscreen and autoplay still work.
- On/off in Settings > Player protection, and in the watch page's three-dots menu ("Ad shield").
  If a player ever says it can't run, turn the shield off for it.
- Limit: ads drawn INSIDE the player (banners on the video) can't be removed from outside. The first click on
  some players can still be eaten by the ad layer; it is blocked from opening anything, so click again.
- YouTube / Vimeo / Dailymotion / Drive are left alone so their own buttons keep working.

Movies (fixed)
- A link with no {ep} is now a MOVIE link, e.g. https://embed.vidrift.net/embed/movie/{tmdb} or https://site/m/{id}.
  No more "needs season and episode". Paste a real movie link and it becomes the pattern by itself
  (a fixed ?title=... is dropped).
- Movie links are used for movies only. Episode links (with {ep}) still work for movies as episode 1.
- Bulk import: movie entries get a "TMDB movie ID" box that finds itself (button "Find it" to retry, or type it).
  A TMDB series is only asked for when a TMDB server has episode-style links.
- Finished movies with no episode count on AniList now count as 1 episode instead of "Needs review".

Link generator (new, Admin > Servers)
- Paste ONE link or ONE <iframe> code (episode 1 of any anime). It finds the ID and episode number, and if the link
  has lang=sub / dub=1 / a /sub/ part it makes the SUB and DUB patterns together.
- Type the anime's ID and the episode range to copy every SUB / DUB link, or ready-made iframe codes
  (they include the ad-shield sandbox). "Save server" adds it to your servers for Bulk import.
- The SUB / DUB boxes in every server now do the same: paste a link or an iframe code and both boxes fill in.
