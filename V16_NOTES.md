# Version 16

Saved links (Admin > Saved links, was "Servers")
- Every link pattern is a row: tick it ON or OFF, rename it, duplicate it, delete it, or open it to edit SUB / DUB.
  Bulk import uses exactly the ones that are ticked on. Room for 40 links.
- Paste a link or an <iframe> code into SUB or DUB: IDs become {id}/{tmdb}, {ep}, and a lang=sub / dub=1 / /dub/ switch
  fills both boxes at once. Movie links (no {ep}) work for AniList and TMDB.
- Link generator on top: find the AniList or TMDB ID by NAME, set the episode range, copy every link or iframe code, or save it.
- Backup: "Copy backup" / "Restore" moves your links between localhost and your Netlify site
  (each browser address keeps its own list).

Settings
- Three tabs: Look (theme, backgrounds), Player (layout, corners, glow), Protection (ad shield, fresh player, strict mode).

Sub / Dub
- The link that plays is now ALWAYS switched to the language that was picked (lang=sub / lang=dub), even if the saved
  link was wrong, and aniembed links without a language get one added.
- Fresh player (Chrome / Brave) plus a new Strict mode for a player that still remembers a language.
- Three-dots menu: "Copy player link" and "Open player link in a new tab" show exactly what is playing.
  Admins see a warning when Sub and Dub on a server are really the same link.

Ad shield
- If an ad layer sends the player ITSELF to an ad page (a sandbox can't stop that), the player is put back automatically.
