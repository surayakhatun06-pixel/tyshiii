# Version 14

Spotlight
- Your spotlight is read with ONE request, started as soon as the site loads, and the last list is kept in the browser.
  The home page waits for it (a plain black space, no AniList list) so it no longer shows the original spotlight,
  goes black, then swaps to yours. Saving the spotlight in admin updates this browser's copy at once.

Servers
- Bulk import > "Already on the site" > Edit links: change a server's name, AniList/TMDB mode, SUB and DUB links once
  and every season, every episode and the live site is rebuilt. Remove still deletes a server from all of them.
  (A TMDB server needs the series to have been imported with its TMDB series.)

Admin
- The Admin icon, "Admin" and "Manage episodes" buttons are gone for visitors. /admin still works by typing it in.
  After you sign in there they appear on every series page (only in the browser that signed in as admin).
  Visitors never load the sign-in code.

Player (Settings > Video player; "Reset to default" puts the old look back)
- Layout: episodes beside (default) or Theater. Episode list on the right (default) or left. Corners rounded (default)
  or square. Soft glow (off by default).

Watch Now
- A black circle opens out from the button, the page changes under it, then it fades to the player.
  Skipped for devices set to reduced motion; ctrl/cmd-click still opens a new tab.
