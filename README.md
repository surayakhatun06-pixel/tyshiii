# TYSHI ZONE

A clean video-watching platform.

- **Home** (`/`): spotlight, a **Continue Watching** row (only shown once you have history), then trending/popular rows.
- **Anime page** (`/anime/:id`): banner, poster, rating, genres, synopsis, cast, related and recommended titles, **Watch Now**, and **+ Add to List**. No links or URLs are shown here.
- **Streaming page** (`/anime/:id/watch?ep=<episodeId>`): the player, episode title, Previous / episode selector / Next, auto-play next, fullscreen, and episode cards. Viewers never see embed URLs or any editing controls. Opens at your resume point; `?ep=` also accepts an episode number.
- **Manage episodes** (`/anime/:id/edit`): add editable rows, paste an `Episode | Title | Thumbnail | URL` list, or import TXT/JSON files. Choose a starting episode number, renumber drafts, preview sources and artwork, and review duplicate warnings before saving. Replacing existing episodes requires confirmation. Search, sort, inspect missing episode numbers, copy links, export backups, and select episodes for confirmed bulk deletion.
- **History** (`/history`): everything you've watched, newest first, with resume and a confirmed **Clear History**.
- **Watch hub** (`/watch`): Continue Watching plus a quick "paste any link" player (YouTube, Vimeo, Dailymotion, Google Drive, direct .mp4/.webm, or `<iframe>` embed code). The separate **Add my own link & series** form supports custom names and image URLs, PNG/JPEG/WebP logo uploads, and AniList search to fill in a series name and artwork. Personal videos appear in a searchable, series-filtered library with editing, confirmed removal, and JSON backup export/import.

### Playback and resume

- Direct video files, YouTube and Vimeo report playback time, so progress is saved every few seconds and playback resumes where you stopped. Past ~92% (or within 20 s of the end) an episode counts as finished and restarts from 0, and Continue Watching offers the next episode.
- Any other iframe embed (hosted players, Drive, etc.) plays normally, but browsers don't let a page read time from a cross-origin iframe. Those episodes are still recorded in history and Continue Watching, without a progress bar or resume position. Moving on with **Next** marks them watched.
- Open the player's **tools** menu to restart playback or enter fullscreen. Direct video files also support playback speeds from 0.5× to 2×, ten-second skip buttons, and picture-in-picture where the browser supports it. Focus a direct-file player to use Space/K (play/pause), arrow keys (seek), M (mute), and F (fullscreen). Embedded sources retain their provider's controls.
- Personal videos have previous/next controls in save order within the current series, optional auto-next when the source reports completion, and a wider theater view. Personal links do not currently use the anime-specific history/resume system.

### Data (all in this browser's localStorage)

- `tyshi-videos-v1`: episodes (`url`, `title`, `episode`, optional `thumbnail`) and personal videos with optional `seriesName` / `seriesLogo`. Older records remain compatible. No accounts or shared library were added; clearing browser storage removes this library, so export backups first.
- `tyshi-progress-v1`: resume positions / history. `tyshi-prefs-v1`: auto-play next and SUB/DUB choice. The watchlist key is unchanged.
- Anime discovery data comes from the public AniList API.

### Shared episodes with Firebase (optional)

- **Admin** (`/admin`): sign in with Firebase Authentication to pick an anime and import **SUB** and **DUB** links from separate TXT files or pasted text. Links keep their order and map to episode numbers (in order from a start number, or from `Episode 5 | url` lines). A preview table and test player are shown before saving, and saving one language never changes the other. Single episodes can also be added, edited or removed.
- Episodes are stored in Firestore (`anime`, `episodeLists`) and shown to every visitor instantly — no redeploy. Each episode can have **any number of servers** (`Server 1`, `VidPlay`, …), each with its own SUB and DUB link; every import asks for a server name. The watch page has a **Server** switch and a **SUB / DUB** switch — both also sit on top of the video, so they stay available in fullscreen — and the choice is remembered. The player still accepts iframe/embed links. When Firestore and this browser both have the same episode number, the Firestore one is used.
- **Your own series**: in `/admin` create a series that isn't on AniList (name, logo, banner, About, genres…). It has its own page and appears in the normal search bar. Details you save for an AniList title (name, poster, banner, About, genres) replace the AniList ones on its page. The old "Available to watch" home row was removed; everything you add in `/admin` appears directly on that series' page. `/admin?anime=<id>` opens a title directly (each anime page has an **Admin** link).
- Without the `VITE_FIREBASE_*` variables the site works exactly as before (browser-only episodes).
- Setup: see [FIREBASE_SETUP.md](./FIREBASE_SETUP.md). Security rules: [`firestore.rules`](./firestore.rules). Variables: [`.env.example`](./.env.example).

### Netlify deployment

`netlify.toml` publishes `dist`, matching the installed Nitro Netlify preset. Server output is generated separately in `.netlify/functions-internal`; neither `dist/client` nor `dist/public` is the publish path for this preset version.

## Run

```bash
bun install   # or npm install
bun run dev
```


## Look & feel (v4)

- **Layout**: slim icon rail on the left, centred search bar on top (live suggestions, Enter opens `/search?q=`), hero banner on home, "Latest Episodes" + "Top Airing", details page with About / Trailer / Episodes / Show / Related / Characters, and a watch page with the episode list beside the player.
- **Themes**: click the brush at the bottom of the rail (bottom bar on phones). Black & white, Purple (default), Blue and Rose. Saved in this browser (`tyshi-theme-v1`).
- **Drag to scroll**: every horizontal list can be dragged with the mouse (touch and trackpad still scroll normally).
- **Search**: searches all of AniList (including 18+ unless you untick the box), loads more pages, retries when AniList is busy, and also finds your own series.
- **Player**: only the video sits inside the player. Sub/Dub, Server, Auto-play, Reload and Fullscreen live in the controls under it (one fullscreen button, in the ⋮ menu).
- **Admin / permissions**: `firestore.rules` is simplified (admins only can write). After updating, publish it again in Firebase → Firestore → Rules.

## v6 changes

- Player background (Settings): Blurred mix (default), Anime banner, Full black. Blur slider (0-100px) for the first two. Saved in the browser (`tyshi-appearance-v2`).
- Spotlight: lighter shading, content kept right of the sidebar, quick fade + blur between slides.
- Latest Episodes: only titles that have episodes on this site; newest episode number shown.
- Sidebar: Trending (flame) and Browse now follow the `?sort=` in the address; highlighting is explicit for every button.
- Episode list: grid by default, scrollbar hidden (wheel / touchpad / touch still scroll); the active episode number uses the selected theme accent.
- Themes apply their accent selectively to active states while the site keeps its black surfaces. Bigger, bolder logo (`public/logo-bold.png`) and new favicon / app icons.


## v7 changes

- Spotlight: back to the previous look (no square/blur block, no shaky drag). Title, Watch Now, Details and "+" are brighter and sit above the shading. Up to 12 slides.
- Watch page: plain video on black, no coloured frame, wider (edge to edge on phones). Settings -> Player background now sets the whole watch page: Full black (default), Anime banner, Blurred mix (blur slider 0-100px).
- Under the player: Next season, Show (all seasons), Related and "You might also like".
- Phone: top bar no longer cuts off the profile button; control buttons wrap instead of being cut.


## v8 changes

- Top bar: no blurred bar behind it any more, only the search and buttons. Phone bottom bar is small, icons only, plain background.
- Phone speed: all backdrop blur is off on phones; the spotlight only keeps the slide on screen (and the next two banners) instead of all 12; no big filters.
- Episode grid: the "dot" squares (episodes with no number) are gone from the grid (still in the list view).

## v9 changes

- Default look is Black & white theme, Full black player, Banner details background.
- Latest Episodes (Sub): popular shows whose newest episode just aired on AniList, with an "On site" tag for titles you have. Dub: titles on this site that have dubs.
- Phone: the episode list sits in the page (no scroll box inside the page) and long lists open with "Show more".
- Speed: the spotlight pauses when off screen, rows below the fold render lazily, fewer live connections, lighter images.

## v10 changes (admin)

- /admin is now a small hub. Add episodes is on top; Bulk import, Add anime or series, My anime and Spotlight each have their own page (?view=...), with a back arrow on every page.
- My anime: every title you added, with a + (add episodes) and an arrow (edit details). Editing/removing episodes is folded away under "Edit or remove episodes".
- Next season / Previous buttons on every title (AniList sequel links; for your own series it opens the new-series form with the next season's name filled in).
- Bulk import (new): search a title, the relation crawler finds every connected season/OVA/ONA/movie/special (PREQUEL, SEQUEL, SIDE_STORY, ALTERNATIVE, SPIN_OFF, PARENT), you tick what you want, define server templates ({id}, {ep}, {track}), and every episode is generated with a dub and sub link per server.
  - Written to series/{franchiseId}/seasons/{anilistId}/episodes/{n} with a `servers` map ({server1:{dub,sub}}), in batched writes of 450.
  - Also published to the live anime/episodeLists documents so the existing player switches server and SUB/DUB straight away (tick off "Also make them playable" to skip).
  - Airing shows import only aired episodes; "Still airing" appends new ones later. Entries with no episode count are flagged "Needs review" until you type a count.
- **Publish the new firestore.rules** (adds the `series` collection) before using Bulk import.

## v10.1 (player + backgrounds)

- SUB/DUB: if both point to different links (e.g. ?track=sub / ?track=dub) the page loads the matching link. If both share ONE link, the player keeps running and the audio track is switched in place: native `video.audioTracks` for direct files, `postMessage` for embeds (edit `PROTOCOLS` in src/lib/audio-track.ts with your player's documented message; embeds in another domain can't be controlled any other way).
- Settings: "Full black everywhere" switch forces plain black behind every page and the player.

## v10.2

- Admin > Add episodes > "Edit or remove episodes" has "Keep episodes up to N and remove the rest" (clean up links generated past what has aired).
- Bulk import: a typed episode count is capped at AniList's count and warns when it is past what has aired.
- Debug: `localStorage.setItem("tyshi-debug-player","1")` then reload; the browser console shows every message the embedded player sends.

## v10.3

- Bulk import step 3: each server has SUB / DUB switches. Example: Server 1 = fast player, SUB only; Server 2 = another link pattern, DUB only. The watch page's Sub/Dub button then moves between servers by itself. {track} is only needed when a server provides both.

## v10.4

- Full black is the default behind every page (Settings > "Full black everywhere", on by default; new key so it applies once to everyone).
- Admin: the same five tabs on every page (Overview, Episodes, Bulk import, Anime, Spotlight); the overview is grouped into "Add content" and "Manage".
- A series' Admin link now offers **Bulk import** (opens the crawler already started from that title).
- Danger zone (Anime > edit a title): delete the series with everything related (episodes, details, Spotlight slide, bulk-import records), or the whole imported franchise. Requires typing DELETE.

## v19.2

- Full-viewport, square-corner sizing for the site's fullscreen command.
- Explicit phone touch scrolling and snap points for New Releases.
- Borderless phone Related anime rail and a more readable, expandable anime synopsis.
- Selected theme accents now color player action buttons and episode numbers.
- The ad-shield iframe sandbox is unchanged.

## v19.3

- Center the collapsed search icon without changing the scroll animation.
- Page recommendation anime in groups of eight with arrow and phone swipe controls.
- Keep the watch-page episode panel visible and prevent recommendation rows from overlapping it.
- Expand site-controlled fullscreen to the full viewport with square corners.
- Provider-owned fullscreen remains native and cross-origin; the ad-shield sandbox stays unchanged.
- The user-supplied .env is included in this release.
## v19.4

- Keep Episodes in a separate bordered section with natural page scrolling and no inner scrollbar.
- Keep episode page controls on one horizontal line at 50 episodes per page.
- Page Related titles in groups of eight, with arrow and horizontal swipe/drag controls on desktop and phones.
- Restore “You might also like” to its original horizontal scrolling rail without arrow paging.
- Preserve the iframe ad-shield sandbox and include the user-supplied `.env` in this release.
