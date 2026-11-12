# Version 17

Sub / Dub
- FOUND A REAL BUG: the "Fresh player" switch added in v15 never reached the player (the browser attribute was dropped),
  so it did nothing. Fixed. It is now really applied (Chrome / Brave / Edge).
- Changing Sub, Dub or server on the watch page now opens a brand-new page (your choice is saved first), so the new
  player starts clean, like a new window. You may need to press play once after switching.
- Strict mode removed (it stopped videos from playing).
- Settings > Protection > "Use the other aniembed address": plays aniembed.ac links from aniembed.se and the other way
  round. Each address remembers its own player settings, so this is the way out if one has stored the wrong language.
- Watch page three-dots menu: "Reset player (fresh start)", "Copy player link", "Open player link in a new tab".
- If Sub / Dub is still stuck: close EVERY tab of your site (and localhost), then open it again. Brave keeps a player's
  temporary memory until all tabs of the site are closed.

Ad shield
- Unchanged and still on by default: clicking an invisible ad layer cannot open a new tab or send you to another site.
  If an ad layer sends the player itself to an ad page, the player is put back.
- Changing a Protection setting restarts the watch page so it applies right away.

Phone player (new, Settings > Player > On phones)
- Player style: "Full width" (the default, exactly as before) or "Rounded card".
- "Keep the player on top" while scrolling (off by default).
- "Reset" in Settings puts the phone options back to the defaults too.
