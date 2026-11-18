# Version 11

Bulk import (Admin -> Bulk import, and inside every anime's admin page):
- New link placeholders: {tmdb} (TMDB ID) and {season} (TMDB season), next to {id} (AniList), {ep}, {track}.
  A server template needs {id} or {tmdb}. Mix servers freely (one with {id}, one with {tmdb}/{season}).
- Step 2: "TMDB ID for this series" field; every entry gets a TMDB season (TV seasons 1,2,3... in watch order,
  movies/OVAs/specials 0) and can have its own TMDB ID. All editable. Saved on the series for later imports.
- Removing a server that was already imported deletes it everywhere: series record, every season's episode
  records and the live site links. There is also an "Already on the site" list with "Remove from all".
- Bulk import is now a fold-out section on every anime admin page (Add episodes, Edit details) and a
  button on every row of My anime.
- After an import finishes, "Watch now" opens the anime's series page.
- Black and white theme is now true black by default.
