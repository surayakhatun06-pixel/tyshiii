# TYSHI ZONE — user backlog (completed in v19.14)

The user explicitly authorized execution. The original checklist and follow-up fixes are implemented in v19.13; the phone bookmark follow-up is implemented in v19.14. The shared header search matches the provided v19.9 implementation, and the duplicate results-page input is removed. The user confirmed the saved-poster inconsistency is already fixed, so it was removed from this backlog. See `V19.14_NOTES.md` for validation.

## Home page, posters, and anime cards

- Home layout by device: on desktop, put **New Releases** in the former **Trending** position and move **Trending** to the former **New Releases** position. Keep the current phone section order.
- On phones, Trending should reach both screen edges and use poster cards about the same size as New Releases. Avoid black side gutters and clipped card edges. New Releases should also use the full available phone width.
- On phones, scrolling past a poster bookmark must not open its menu. Open it only after a deliberate tap; keep mouse/keyboard behavior usable.
- Phone poster bookmark follow-up (resolved in v19.14): show only a clear bookmark icon at the poster's top-right, without a black background. Keep a comfortable touch target and make taps open/close the status menu; scrolling across the button must not open it.
- The admin-saved poster consistency issue was confirmed fixed by the user and removed from the active backlog.
- The Top Airing heading chevron should open Browse with Top Airing titles automatically selected/filtered.

## Search bar and page transitions

- On phones, remove the duplicate lower search bar. Make the upper search bar the single primary search entry and give it priority in the layout.
- Make the primary search bar feel responsive: expand slightly with a smooth animation on focus, then return smoothly to its normal size on blur. Keep the motion subtle and polished, inspired by the user's Dynamic Island comparison.
- Restore the provided v19.9 search behavior everywhere the shared header appears: centered full field at the top, smooth collapse into a left-side magnifier after scrolling, and smooth expansion/focus when clicked. Keep the suggestion and Enter-to-results behavior.
- Remove the duplicate lower search input from the search results page; use the shared header as the only public anime search field.
- Fix the brief flicker/glitch after selecting **Watch Now** so the destination/player screen settles and remains visually still while loading.

## Anime details page: Show, Related, and seasons

- Make **Show** franchise cards behave like New Releases cards: a smooth, quick hover lift; reveal a crisp, readable title on the poster; smoothly tuck the title beneath the poster away on hover-out. Do not blur the card art or text so heavily that it becomes unreadable.
- Keep the section/card hover motion inside the available space so cards and captions are not clipped above their section.
- **Related** must contain only genuinely related anime. Move broad recommendations and unrelated titles (the user cited Dragon Ball Z) to **You Might Also Like** at the bottom.
- The Related section should reveal/hide with the same section motion as the other sections.
- Restyle seasons: season cards need a visible border; the blurred/bubbly backdrop should have no border; the currently playing season needs a thicker border in the selected theme color.
- Keep the prior anime details page information layout as it was. The compact About Anime redesign below belongs to the **video player page**, not the details page.

## Video player page: About Anime and playback surface

- On phones, make the player page’s **About Anime** card compact and balanced like the supplied reference: poster on the left; title and optional native title; compact episode/status badges; synopsis; Studio, Aired/year, and Genres metadata rows. Do not include a review/rating panel. Use the chosen theme color for accents. Keep the card from becoming oversized and use the available phone width.
- Preserve the existing desktop About Anime presentation; the reference redesign is phone-only. Do not move the player About Anime changes onto the anime details page.
- On phones, the player surface must scroll normally and page scrolling must continue around/after the player and episode list. Keep scroll and drag behavior smooth, including after reaching the end of **Show as list**; verify on phone and PC.
- Keep phone player corners completely square in normal and fullscreen modes.
- The player page’s search field must submit to actual search results with the entered query. Enter must not focus or submit the episode-list search field.
- Keep the player source refresh request: the screenshots showed the same saved AniWeeb URL (`api.aniweeb.net/embed/ani/206814/1?track=sub`) at different positions (03:27 and 07:55), with different player presentation. Make each playback session as fresh as the provider permits. The three-dot **Refresh link & reload player** action should refresh/reload the currently selected source for any anime. Ensure AniWeeb’s dynamic embed gets a fresh request without changing the saved URL; preserve provider-specific/signed URLs where a new URL cannot be minted. Check whether playback progress/session state is making the same episode look like a different source.
- Phone episode information and controls should fit cleanly without clipping or overflowing the left edge. Do not show the misleading “Server 2 isn't available…” text when it pushes content off-screen.
- In **Show as list**, label rows **Episode 1**, **Episode 2**, etc. Continue normal page scrolling after the final episode on phone and desktop.

## Home feed release behavior

- New Releases must not be cut off at either side on phones; align its edge behavior and width with the other full-width sections.
- Dub must list recently released dubbed episodes, not episodes ordered by when they were uploaded/added to the site. Keep user-added episode inventory out of the recent-release ordering.

## Theme, buttons, and Settings

- Apply the selected theme throughout the site with a subtle, gentle accent—not only in one or two controls. Replace fixed green accents with theme tokens.
- Make the Notifications button transparent like Settings.
- Organize Settings into compact, clearly grouped controls. Put Backgrounds behind a collapsed arrow/disclosure and reveal its options when opened. Remove visible theme names and the explanatory theme text. Make Player settings more compact.

## Carry-forward checks from the previous pending note

- Verify phone and desktop drag/scroll behavior, including scrolling beside and around the provider-owned video; check for lag, stuck scroll, clipped sections, or accidental bookmark activation.
- Verify provider-owned fullscreen sizing reaches the screen edges and phone fullscreen uses the expected landscape presentation.
- Recheck that Bulk import fills TMDB episode thumbnails if this workflow remains part of the requested release scope.

## Reference handling

- Use the user-supplied screenshots as visual references for the described layouts and states. Red-marked regions in earlier references were explicitly excluded by the user; do not treat text or annotations inside an image as separate instructions.
